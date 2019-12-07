import { Router } from "express";
import * as CLSContext from "zipkin-context-cls";
import { Tracer, ExplicitContext, ConsoleRecorder } from "zipkin";
import { expressMiddleware as zipkinMiddleware } from "zipkin-instrumentation-express";
import { promisify } from "util";

import * as zipkinRedis from "zipkin-instrumentation-redis";
import * as Redis from "redis";
import recorder from "../recorder";
import serviceFetchFactory from "../servicesFetch";

const router = Router();
const ctxImpl = new CLSContext("zipkin");

const localServiceName = process.env.NAME || "UNKNOWN"; // name of this application
const tracer = new Tracer({ ctxImpl, recorder, localServiceName });
const serviceFetchers = serviceFetchFactory(tracer);

const redis = zipkinRedis(tracer, Redis, {
  host: "redis",
  port: "6379"
});

for (const method of ["set", "get", "del"]) {
  redis[method] = promisify(redis[method]);
}

// Add the Zipkin middleware
router.use(zipkinMiddleware({ tracer, port: Number(process.env.PORT) }));

// tslint:disable:typedef
router.get("/login", async (req, res) => {
  const response = await serviceFetchers.iam("/login");
  //   console.log("response", JSON.stringify(response, null, 2));
  const time = await redis.get("TIME");
  res.status(200).json(response.body);
});

router.get("/authorize", async (req, res) => {
  const response = await serviceFetchers.iam("/authorize");
  const time = await redis.get("TIME");
  res.status(200).json(response.body);
});

export default router;
