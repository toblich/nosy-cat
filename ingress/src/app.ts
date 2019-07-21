import * as express from "express";
import { logger, producer } from "helpers";
import { ping } from "./kafka-integration";

const app: express.Application = express();

logger.info("Starting ingress app...");

producer.on("ready", async () => {
  app.get("/ping", (req, res) => {
    ping();
    res.send("pong");
  });

  app.listen(3000, () => logger.info("Ingress listening on port 3000"));
});
