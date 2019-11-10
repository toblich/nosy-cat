import * as express from "express";
import { logger, kafkaWrapper, createZipkinContextTracer, createZipkinExpress } from "helpers";
import { spans } from "./kafka-integration";

const contextTracer = createZipkinContextTracer("ingress");

const app = createZipkinExpress(contextTracer.tracer);

const wrapper = kafkaWrapper(contextTracer.tracer, "ingress");

logger.info("Starting ingress app...");

// tslint:disable-next-line:typedef
const run = async () => {
  const kafka = await wrapper;

  const producer = kafka.producer;

  // tslint:disable-next-line:typedef
  app.post("/api/v2/spans", async (req, res) => {
    const body = req.body;

    try {
      await spans(producer as any, body);
      res.send();
    } catch (error) {
      res.status(error.status || 500).send(error.message || "InternalServerError");
    }
  });

  // tslint:disable-next-line:typedef
  app.get("/", (_, res) => {
    res.send("up");
  });

  app.listen(3000, () => logger.info("Ingress listening on port 3000"));
};

// tslint:disable-next-line:no-console
run().catch(console.error);
