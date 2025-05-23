"use client";

import * as mediasoup from "mediasoup-client";
import { Socket } from "socket.io-client";
import { socketRpc } from "./socketRpc";
import { ClientToServerEvents, ServerToClientEvents } from "./types";

export class Peer {
  private _device: mediasoup.Device | null = null;
  private _sendTransport: mediasoup.types.Transport | null = null;
  private _recvTransport: mediasoup.types.Transport | null = null;

  private producers: Map<string, mediasoup.types.Producer> = new Map();
  private consumers: Map<string, mediasoup.types.Consumer> = new Map();

  constructor(
    private socket: Socket<ServerToClientEvents, ClientToServerEvents>
  ) {}

  get device() {
    if (!this._device) {
      throw new Error("Device not initialized");
    }
    return this._device;
  }

  get sendTransport() {
    if (!this._sendTransport) {
      throw new Error("Send transport not initialized");
    }
    return this._sendTransport;
  }

  get recvTransport() {
    if (!this._recvTransport) {
      throw new Error("Recv transport not initialized");
    }
    return this._recvTransport;
  }

  async initDevice(rtpCapabilities: mediasoup.types.RtpCapabilities) {
    this._device = new mediasoup.Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
  }

  private setupTransport(
    transport: mediasoup.types.Transport,
    type: "send" | "recv"
  ) {
    transport.on("connect", async ({ dtlsParameters }, callback) => {
      await socketRpc(this.socket, "transport-connect", {
        transportId: transport.id,
        dtlsParameters,
      });
      callback();
    });

    if (type === "send") {
      transport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback) => {
          const { id: producerId } = await socketRpc(this.socket, "produce", {
            transportId: transport.id,
            kind,
            rtpParameters,
            appData,
          });
          callback({ id: producerId });
        }
      );
    }
  }

  async initTransports() {
    const sendOptions = await socketRpc(
      this.socket,
      "create-webrtc-transport",
      {
        direction: "send",
      }
    );
    this._sendTransport = this.device.createSendTransport(sendOptions);
    this.setupTransport(this.sendTransport, "send");

    const recvOptions = await socketRpc(
      this.socket,
      "create-webrtc-transport",
      {
        direction: "recv",
      }
    );
    this._recvTransport = this.device.createRecvTransport(recvOptions);
    this.setupTransport(this.recvTransport, "recv");
  }

  async produce() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    const audioProducer = await this.sendTransport.produce({
      track: audioTrack,
    });
    const videoProducer = await this.sendTransport.produce({
      track: videoTrack,
    });
    this.producers.set(audioProducer.id, audioProducer);
    this.producers.set(videoProducer.id, videoProducer);

    return {
      audioTrack,
      videoTrack,
    };
  }

  async onNewProducer(producerId: string) {
    const data = await socketRpc(this.socket, "consume", {
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });
    const consumer = await this.recvTransport.consume(data);
    this.consumers.set(consumer.id, consumer);
    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    return {
      consumerId: consumer.id,
      stream,
    };
  }
}
