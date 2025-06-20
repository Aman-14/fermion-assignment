"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react"; // Added Suspense
import { io, Socket } from "socket.io-client";
import { SERVER_URL, SOCKET_PATH } from "../constants";
import { Peer } from "./peer";
import { socketRpc } from "./socketRpc";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

function getSocketUrl() {
  return SERVER_URL === "/api" ? window.location.origin : SERVER_URL;
}

// Component containing the actual page logic and UI
function StreamPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const username = searchParams.get("username");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    console.log("RUNNING use effect");
    if (!username) {
      router.replace("/");
      return;
    }

    // Initialize socket.io connection
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      getSocketUrl(),
      {
        path: SOCKET_PATH,
        transports: ["websocket"],
        query: {
          username,
        },
      },
    );

    // Create Peer instance
    const peerInstance = new Peer(socket);

    async function handleNewProducer(producer: { id: string; kind: string }) {
      if (peerInstance.isSelfProducer(producer.id)) {
        console.log("Skipping self producer");
        return;
      }
      const { stream } = await peerInstance.onNewProducer(producer.id);
      if (producer.kind === "video" && remoteVideoRef.current) {
        console.log("Setting remote video stream", stream);
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch((error) => {
          console.error("Error playing video:", error);
        });
      } else if (producer.kind === "audio" && remoteAudioRef.current) {
        console.log("Setting remote audio stream", stream);
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((error) => {
          console.error("Error playing audio:", error);
        });
      }
    }

    socket.on("connected", async () => {
      const rtpCapabilities = await socketRpc(socket, "get-rtp-capabilities");
      console.log("Initializing device");
      await peerInstance.initDevice(rtpCapabilities);
      console.log("Initializing transports");
      await peerInstance.initTransports();

      socket.emit("get-existing-producers", async (producers) => {
        for (const producer of producers) {
          await handleNewProducer(producer);
        }
      });

      // --- Produce local tracks ---
      const { audioTrack, videoTrack } = await peerInstance.produce();
      const stream = new MediaStream();
      stream.addTrack(audioTrack);
      stream.addTrack(videoTrack);
      setLocalStream(stream);
    });

    socket.on("new-producer", async (data) => {
      console.log("on new producer");
      if (!peerInstance) {
        console.warn("PEER INstance not found in new producer");
        return;
      }
      await handleNewProducer(data);
    });

    socket.on("producer-closed", ({ producerId }) => {
      // Optionally handle cleanup if a remote producer is closed
      // e.g., remove remote video/audio
    });

    return () => {
      socket.disconnect();
      setLocalStream(null);
    };
  }, [username, router]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current
        .play()
        .catch((e) => console.error("Local video play() failed:", e));
    }
  }, [localStream]);

  // --- UI rendering ---
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-center text-2xl font-bold">
          Stream Page - User: {searchParams.get("username")}
        </h1>

        <div className="rounded border bg-gray-200 p-2 shadow">
          <h2 className="text-lg font-semibold">My Stream</h2>
          {localStream ? (
            <video
              className="aspect-video w-full rounded"
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500">
              No local stream
            </div>
          )}
        </div>

        <div className="rounded border bg-gray-200 p-2 shadow">
          <h2 className="text-lg font-semibold">Remote Video</h2>
          <video
            className="aspect-video w-full rounded"
            ref={remoteVideoRef}
            autoPlay
            playsInline
          />
        </div>
        <div className="rounded border bg-gray-200 p-2 shadow">
          <h2 className="text-lg font-semibold">Remote Audio</h2>
          <audio ref={remoteAudioRef} autoPlay />
        </div>
      </div>
    </div>
  );
}

export default function StreamPage() {
  return (
    <Suspense fallback={<div>Loading page...</div>}>
      <StreamPageContent />
    </Suspense>
  );
}
