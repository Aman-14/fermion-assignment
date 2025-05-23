export const SERVER_URL = "/api";
export const HLS_STREAM_PATH = "/hls/live.m3u8";
export const HLS_STREAM_URL = `${SERVER_URL}${HLS_STREAM_PATH}`;
export const SOCKET_SERVER_URL =
  SERVER_URL === "/api" ? window.location.origin : SERVER_URL;
export const SOCKET_PATH = "/api/socket.io/";
