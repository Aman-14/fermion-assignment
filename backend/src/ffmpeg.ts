import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import type * as medisaoup from "mediasoup";
import path from "path";

const INITIAL_RTP_PORT = 5004;
const INITIAL_RTCP_PORT = 5005;
const ADDRESS = "127.0.0.1";

export class FFmpeg {
  private transports: Map<
    string,
    medisaoup.types.PlainTransport<{
      port?: number;
    }>
  > = new Map();
  private consumers: Map<
    string,
    medisaoup.types.Consumer<{
      transportId: string;
    }>
  > = new Map();

  private process?: ffmpeg.FfmpegCommand;

  constructor(private router: medisaoup.types.Router) {}

  private async _createSDP() {
    let sdp = "";
    // --- Session Description ---
    sdp += `v=0\r\n`;
    sdp += `o=- ${Date.now()} ${Date.now()} IN IP4 127.0.0.1\r\n`;
    sdp += `s=Fermion Demo Stream\r\n`;
    sdp += `t=0 0\r\n`;

    let portIndex = 0;
    this.consumers.forEach((consumer) => {
      if (consumer.closed) {
        console.log(
          `Skipping closed consumer ${consumer.id} for SDP generation.`,
        );
        return;
      }
      const currentPort = INITIAL_RTP_PORT + portIndex;
      const currentRtcpPort = INITIAL_RTCP_PORT + portIndex;

      const transport = this.transports.get(consumer.appData.transportId);
      if (!transport) {
        throw new Error("Unexpected error: transport not found for consumer");
      }
      transport.appData.port = currentPort;

      const codec = consumer.rtpParameters.codecs[0];
      sdp += `m=${consumer.kind} ${currentPort} RTP/AVP ${codec.payloadType}\r\n`;
      sdp += `c=IN IP4 ${ADDRESS}\r\n`;

      sdp += `a=rtcp:${currentRtcpPort}\r\n`;

      sdp += `a=rtpmap:${codec.payloadType} ${codec.mimeType.split("/")[1]}/${codec.clockRate}${codec.channels && codec.channels > 1 ? "/" + codec.channels : ""}\r\n`;

      const midSuffix = consumer.producerId || consumer.id;
      sdp += `a=mid:${midSuffix}-${consumer.kind}\r\n`;
      portIndex += 2;
    });
    const sdpFilePath = path.resolve(process.cwd(), "ffmpeg_stream.sdp");
    await fs.promises.writeFile(sdpFilePath, sdp);
    return sdpFilePath;
  }

  private async _startProcess(input: string) {
    if (this.process) {
      throw new Error("Process already started");
    }
    const outputDir = path.join(process.cwd(), "public", "hls");
    await fs.promises.rm(outputDir, { recursive: true, force: true });
    await new Promise((res) => setTimeout(res, 5000));
    await fs.promises.mkdir(outputDir, { recursive: true });

    await new Promise((res) => setTimeout(res, 5000));

    const outputM3u8 = path.join(outputDir, "live.m3u8");
    const segmentFilename = path.join(outputDir, "segment%05d.ts");
    console.log({
      outputDir,
      outputM3u8,
      segmentFilename,
    });
    const command = ffmpeg(input)
      .inputOptions("-protocol_whitelist file,udp,rtp")
      // [0:v:0] is the first video stream
      // [0:v:1] is the second video stream
      // [0:a:0] is the first audio stream
      // [0:a:1] is the second audio stream
      .complexFilter(
        "[0:v:0][0:v:1]hstack=inputs=2[v_stacked];[0:a:0][0:a:1]amix=inputs=2[a_mixed]",
        ["v_stacked", "a_mixed"], // Map the filter outputs
      )
      .videoCodec("libx264")
      .addOutputOption("-preset medium") // Or 'fast'/'veryfast' if CPU is an issue for live
      .addOutputOption("-crf 23") // Adjust for quality/bitrate balance
      .addOutputOption("-g", "60") // GOP size (keyframe interval)
      .audioCodec("aac") // audio encoding
      .audioBitrate("192k") // audio bitrate
      .format("hls")
      .addOutputOption("-hls_time", "4") // Segment duration (e.g., 2-6 seconds for live)
      .addOutputOption("-hls_list_size", "5") // Number of segments in the playlist (sliding window)
      .addOutputOption("-hls_segment_filename", segmentFilename)
      .addOutputOption(
        "-hls_flags",
        "delete_segments+independent_segments+program_date_time",
      )
      .output(outputM3u8);

    return new Promise<void>((resolve, reject) => {
      command
        .on("start", function (commandLine) {
          console.log("Spawned Ffmpeg with command: " + commandLine);
          // give it some time to start
          setTimeout(resolve, 5000);
        })
        .on("progress", function (progress) {
          console.log("Progress: ", JSON.stringify(progress));
        })
        .on("error", function (err, stdout, stderr) {
          console.error("An error occurred: " + err.message);
          console.error("ffmpeg stdout:\n" + stdout);
          console.error("ffmpeg stderr:\n" + stderr);
          return reject(err);
        })
        .run();
    });
  }

  async addConsumer(producer: medisaoup.types.Producer) {
    const producerRtpParameters = producer.rtpParameters;
    const transport = await this.router.createPlainTransport({
      listenIp: "127.0.0.1",
    });
    this.transports.set(transport.id, transport);

    // maek capabilities from producer
    const consumerRtpCapabilities: medisaoup.types.RtpCapabilities = {
      codecs: [
        {
          mimeType: producerRtpParameters.codecs[0].mimeType,
          kind: producer.kind,
          clockRate: producerRtpParameters.codecs[0].clockRate,
          channels: producerRtpParameters.codecs[0].channels,
          parameters: producerRtpParameters.codecs[0].parameters,
          rtcpFeedback: producerRtpParameters.codecs[0].rtcpFeedback,
        },
      ],
    };
    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: consumerRtpCapabilities,
      paused: true, // start in paused state otherwise ffmpeg will miss the starting frames and cannot build the video
      appData: {
        transportId: transport.id,
      },
    });
    this.consumers.set(producer.id, consumer);
    consumer.on("producerclose", async () => {
      consumer.close();
      this.consumers.delete(producer.id);
      const transport = this.transports.get(consumer.appData.transportId)!;
      transport.close();
      this.transports.delete(consumer.appData.transportId);
    });
    return consumer;
  }

  async start() {
    const sdpFile = await this._createSDP();
    await this._startProcess(sdpFile);

    for (const transport of this.transports.values()) {
      await transport.connect({
        ip: ADDRESS,
        port: transport.appData.port,
      });
    }
    for (const consumer of this.consumers.values()) {
      await consumer.resume();
    }
  }

  kill() {
    for (const transport of this.transports.values()) {
      transport.close();
    }
    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    this.transports.clear();
    this.consumers.clear();
    if (this.process) {
      this.process.kill("SIGKILL"); // gracefully stop ffmpeg
    }
  }
}
