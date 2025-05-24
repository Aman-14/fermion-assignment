import { config } from "dotenv-flow";
config();

import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import http from "http";
import { BadRequestError } from "./error.js";
import { FFmpeg } from "./ffmpeg.js";
import { setupMediasoup } from "./mediasoup.js";
import { setupSocketServer } from "./socket.js";

const PORT = 8002;

const app = express();
app.use(cors());

const publicPath = "public";
app.use(express.static(publicPath));

const server = http.createServer(app);
let ffmpeg: FFmpeg | undefined = undefined;

const { router, worker } = await setupMediasoup();
const { streams } = setupSocketServer(server, router, {
  // kill the ffmpeg process when the client disconnects
  onDisconnect: () => {
    if (ffmpeg) {
      console.log("Killing ffmpeg process");
      ffmpeg.kill();
      ffmpeg = undefined;
    }
  },
});

app.post("/watch", async (_req, res) => {
  if (!ffmpeg) {
    // For now, we support streams of only 2 peers
    if (streams.size !== 2) {
      throw new BadRequestError(
        "WAITING_FOR_PEERS",
        "Please wait for the peers to join",
      );
    }
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

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof BadRequestError) {
    res.status(400).json(err);
    return;
  }
  res.status(500).json({ error: "Internal Server Error" });
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
