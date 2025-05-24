"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { HLS_STREAM_URL, SERVER_URL } from "../constants";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

export default function WatchPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hlsSupported, setHlsSupported] = useState<boolean | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const setupHls = useCallback(() => {
    if (!videoRef.current) return;
    if (Hls.isSupported()) {
      setHlsSupported(true);
      const hls = new Hls();
      hls.loadSource(HLS_STREAM_URL);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        setError("");
        videoRef.current?.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            retryCount < MAX_RETRIES
          ) {
            setRetryCount((c) => c + 1);
            setTimeout(() => {
              hls.destroy();
              setupHls();
            }, RETRY_DELAY_MS);
          } else {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setError(
                  "Stream not found or network error. Please try again later."
                );
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setError("Fatal media error encountered");
                hls.recoverMediaError();
                break;
              default:
                setError("Unrecoverable HLS.js error. Destroying instance.");
                hls.destroy();
                break;
            }
            setLoading(false);
          }
        }
      });
      // Cleanup on unmount
      return () => {
        hls.destroy();
      };
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      setHlsSupported(false); // Native support
      videoRef.current.src = HLS_STREAM_URL;
      videoRef.current.addEventListener("loadedmetadata", () => {
        videoRef.current?.play().catch(() => {});
      });
      return () => {
        videoRef.current!.src = "";
      };
    } else {
      setError("HLS is not supported in this browser.");
      setHlsSupported(false);
      return;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let cleanup: (() => void) | undefined;
    const pollWatchApi = async (retry = 0) => {
      setLoading(true);
      setError("");
      if (signal.aborted) return;
      const res = await fetch(`${SERVER_URL}/watch`, {
        method: "POST",
        signal,
      });
      if (res.ok) {
        if (!signal.aborted) {
          cleanup = setupHls();
        }
        return;
      }
      if (res.status === 400) {
        const data: { code: string; message: string } = await res.json();
        if (data.code === "WAITING_FOR_PEERS") {
          setError(
            "Waiting for peers to join. There should be exactly 2 peers to start the streams."
          );
          setLoading(false);
          setTimeout(() => {
            if (!signal.aborted) pollWatchApi(retry + 1);
          }, RETRY_DELAY_MS);
          return;
        }
        setError(data.message || "Failed to start watching: backend error");
        setLoading(false);
        return;
      }
      setError("Failed to start watching: backend error");
      setLoading(false);
      return;
    };
    pollWatchApi();
    return () => {
      controller.abort();
      if (cleanup) cleanup();
    };
  }, [setupHls]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-6 text-white">HLS Live Stream</h1>
      <div className="w-[90%] max-w-2xl shadow-2xl mb-2 bg-black rounded-lg overflow-hidden">
        {error ? (
          <p className="text-red-400 text-center py-8">{error}</p>
        ) : (
          <video
            ref={videoRef}
            controls
            autoPlay
            muted
            className="w-full bg-black"
            style={{ display: loading ? "none" : "block" }}
          />
        )}
        {loading && !error && (
          <div className="text-gray-400 text-center py-8">
            Loading stream...
            {retryCount > 0 && <span> (retry {retryCount})</span>}
          </div>
        )}
      </div>
      {error === "HLS is not supported in this browser." ? null : (
        <p className="text-gray-400 text-sm mt-2">
          Playing: <span className="text-gray-200">{HLS_STREAM_URL}</span>
        </p>
      )}
    </div>
  );
}
