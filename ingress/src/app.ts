import * as express from "express";
import { logger, kafkaWrapper, createZipkinContextTracer, createZipkinExpress } from "helpers";
import { ping, spans } from "./kafka-integration";

const contextTracer = createZipkinContextTracer("ingress");

const app: express.Application = createZipkinExpress(contextTracer.tracer);

const wrapper = kafkaWrapper(contextTracer.tracer);

logger.info("Starting ingress app...");

const run = async () => {
  const kafka = await wrapper;

  const producer = kafka.producer;

  app.get("/ping", (req, res) => {
    ping(producer as any);
    res.send("pong");
  });

  app.post("/api/v2/spans", async (req, res) => {
    const body = req.body;

    try {
      await spans(producer as any, body);
      res.send();
    } catch (error) {
      res.status(error.status).send(error.message);
    }
  });

  app.listen(3000, () => logger.info("Ingress listening on port 3000"));
};

// tslint:disable-next-line:no-console
run().catch(console.error);
