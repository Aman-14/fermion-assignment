import type * as mediasoup from "mediasoup";

export interface ServerToClientEvents {
  connected: () => void;
  "new-producer": (
    data: Pick<
      mediasoup.types.Producer,
      "id" | "kind" | "rtpParameters" | "appData"
    >,
  ) => void;
  "producer-closed": (data: { producerId: string }) => void; // For notifying clients when a producer is closed
}

export interface ClientToServerEvents {
  "get-rtp-capabilities": (
    ack: (data: mediasoup.types.RtpCapabilities) => void,
  ) => void;
  "get-existing-producers": (
    ack: (
      data: Pick<mediasoup.types.Producer, "id" | "kind" | "appData">[],
    ) => void,
  ) => void;
  "transport-connect": (
    payload: {
      transportId: string;
      dtlsParameters: mediasoup.types.DtlsParameters;
    },
    ack: (response: { transportId: string }) => void,
  ) => void;
  "create-webrtc-transport": (
    payload: {
      direction: "send" | "recv";
    },
    ack: (
      response: Pick<
        mediasoup.types.WebRtcTransport,
        | "id"
        | "iceParameters"
        | "iceCandidates"
        | "dtlsParameters"
        | "sctpParameters"
      >,
    ) => void,
  ) => void;
  produce: (
    payload: {
      transportId: string;
      kind: mediasoup.types.Producer["kind"];
      rtpParameters: mediasoup.types.RtpParameters;
      appData: mediasoup.types.AppData;
    },
    ack: (
      response: Pick<
        mediasoup.types.Producer,
        "id" | "kind" | "rtpParameters" | "appData"
      >,
    ) => void,
  ) => void;
  consume: (
    payload: {
      transportId: string;
      producerId: string;
      rtpCapabilities: mediasoup.types.RtpCapabilities;
    },
    ack: (
      response: Pick<
        mediasoup.types.Consumer,
        "id" | "producerId" | "kind" | "rtpParameters" | "appData"
      >,
    ) => void,
  ) => void;
}
