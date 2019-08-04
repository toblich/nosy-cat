import * as express from "express";
import { logger, kafkaWrapper, createZipkinContextTracer, createZipkinExpress } from "helpers";
import { ping } from "./kafka-integration";

const contextTracer = createZipkinContextTracer("ingress");

const app: express.Application = createZipkinExpress(contextTracer.tracer);

const wrapper = kafkaWrapper(contextTracer.tracer);

logger.info("Starting ingress app...");

const run = async () => {
  const kafka = await wrapper;

  const producer = kafka.producer;

  app.get("/ping", (req, res) => {
    ping();
    res.send("pong");
  });

  app.listen(3000, () => logger.info("Ingress listening on port 3000"));
};

// tslint:disable-next-line:no-console
run().catch(console.error);
