import express from "express";
import http from "http";
import { FFmpeg } from "./ffmpeg.js";
import { setupMediasoup } from "./mediasoup.js";
import { setupSocketServer } from "./socket.js";
import cors from "cors";

const PORT = 8002;

const app = express();
app.use(cors());

const publicPath = "public";
app.use(express.static(publicPath));

const server = http.createServer(app);
let ffmpeg: FFmpeg | undefined = undefined;

const { router, worker } = await setupMediasoup();
const { streams } = setupSocketServer(server, router);

app.post("/watch", async (_, res) => {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg(router);
    const producers = streams
      .values()
      .map((v) => v.producers.values().toArray())
      .toArray()
      .flat();
    for (const producer of producers) {
      await ffmpeg.addConsumer(producer);
    }
    await ffmpeg.start();
  }
  res.sendStatus(200);
});

app.get("/health", (_, res) => {
  res.sendStatus(200);
});

server.listen(PORT, () => {
  console.log(`App listening on port ${PORT}!`);
  console.log(`Mediasoup worker PID: ${worker.pid}`);
});

function shutdown() {
  console.log("Shutting down...");
  ffmpeg?.kill();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
