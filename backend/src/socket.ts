import http from "http";
import * as mediasoup from "mediasoup";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "./types.js";

export function setupSocketServer(
  httpServer: http.Server,
  router: mediasoup.types.Router,
) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: "*",
      },
    },
  );

  const streams = new Map<
    string,
    {
      username: string;
      transports: Map<string, mediasoup.types.Transport>;
      producers: Map<string, mediasoup.types.Producer>;
      consumers: Map<string, mediasoup.types.Consumer>;
    }
  >();

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);
    const state = {
      username: socket.handshake.query.username as string,
      transports: new Map<string, mediasoup.types.Transport>(),
      producers: new Map<string, mediasoup.types.Producer>(),
      consumers: new Map<string, mediasoup.types.Consumer>(),
    };
    streams.set(socket.id, state);

    socket.emit("connected");

    socket.on("disconnect", () => {
      streams.delete(socket.id);
    });

    socket.on("get-rtp-capabilities", (ack) => {
      ack(router.rtpCapabilities);
    });

    socket.on("create-webrtc-transport", async (data, ack) => {
      const state = streams.get(socket.id);
      if (!state) {
        console.error(
          `create-webrtc-transport: No state found for socket ${socket.id}`,
        );
        return;
      }
      const transportOptions: mediasoup.types.WebRtcTransportOptions = {
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: process.env.ANNOUNCE_IP || "127.0.0.1",
          },
        ],
        enableSctp: true,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        appData: { clientId: socket.id, direction: data.direction },
      };
      const transport = await router.createWebRtcTransport(transportOptions);

      // TODO: read about it
      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          console.log(
            `Send transport DTLS closed for ${socket.id} ${transport.id}`,
          );
          transport.close(); // Ensure transport is closed
          state.transports.delete(transport.id);
        }
      });
      // TODO: read about it
      transport.on("icestatechange", (iceState) => {
        console.log(
          `Send transport ICE state for ${socket.id} ${transport.id}: ${iceState}`,
        );
      });
      state.transports.set(transport.id, transport);
      ack({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
      });
    });

    socket.on("transport-connect", async (data, ack) => {
      const state = streams.get(socket.id);
      if (!state) {
        const errMsg = `transport-connect: No state found for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }
      const transport = state.transports.get(data.transportId);
      if (!transport) {
        const errMsg = `transport-connect: No transport found with id ${data.transportId} for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }
      await transport.connect({ dtlsParameters: data.dtlsParameters });
      console.log(
        `Transport connected: ${transport.id} for client ${socket.id}`,
      );
      ack({ transportId: transport.id });
    });

    socket.on("get-existing-producers", async (ack) => {
      const state = streams.get(socket.id);
      if (!state) {
        const errMsg = `get-existing-producers: No state found for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }
      const producers = streams
        .values()
        .map((s) => s.producers.values().toArray())
        .toArray()
        .flat()
        .map((p) => ({
          id: p.id,
          kind: p.kind,
          appData: p.appData,
        }));

      ack(producers);
    });

    socket.on("produce", async (data, ack) => {
      const state = streams.get(socket.id);
      if (!state) {
        const errMsg = `produce: No state found for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }
      const transport = state.transports.get(data.transportId);
      if (!transport) {
        const errMsg = `produce: No transport found with id ${data.transportId} for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }

      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters,
        appData: {
          clientId: socket.id,
          username: state.username,
        },
      });
      state.producers.set(producer.id, producer);

      producer.on("transportclose", () => {
        console.log(
          `Producer's transport closed ${producer.id} for client ${socket.id}`,
        );
        producer.close();
        state.producers.delete(producer.id);
        socket.broadcast.emit("producer-closed", { producerId: producer.id });
      });

      const producerData = {
        id: producer.id,
        kind: producer.kind,
        rtpParameters: producer.rtpParameters,
        appData: producer.appData,
      };

      ack(producerData);
      socket.broadcast.emit("new-producer", producerData);
      console.log(
        `Producer created: ${producer.id} (${producer.kind}) by ${socket.id} (${state.username})`,
      );
    });

    socket.on("consume", async (data, ack) => {
      const state = streams.get(socket.id);
      if (!state) {
        const errMsg = `consume: No state found for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }
      const transport = state.transports.get(data.transportId);
      if (!transport) {
        const errMsg = `consume: No transport (recv) found with id ${data.transportId} for socket ${socket.id}`;
        console.error(errMsg);
        return;
      }
      if (
        !router.canConsume({
          producerId: data.producerId,
          rtpCapabilities: data.rtpCapabilities,
        })
      ) {
        const errMsg = `Client ${socket.id} cannot consume producer ${data.producerId}`;
        console.error(errMsg);
        return;
      }

      const consumer = await transport.consume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
        paused: false,
        appData: {
          clientId: socket.id,
          username: state.username,
        },
      });
      state.consumers.set(consumer.id, consumer);
      ack({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        appData: consumer.appData,
      });
    });
  });

  return {
    io,
    streams,
  };
}
