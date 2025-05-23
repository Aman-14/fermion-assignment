import * as mediasoup from "mediasoup";

export async function setupMediasoup() {
  const worker = await mediasoup.createWorker({
    logLevel: "debug",
    logTags: ["info", "ice", "dtls", "rtp", "rtcp", "srtp"],
  });

  worker.on("died", (error) => {
    console.error("mediasoup worker has died:", error);
    process.exit(1);
  });

  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      },
    ],
  });
  return { worker, router };
}
