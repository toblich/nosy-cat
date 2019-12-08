import { Router } from "express";
import * as CLSContext from "zipkin-context-cls";
import { Tracer, ExplicitContext, ConsoleRecorder } from "zipkin";
import { expressMiddleware as zipkinMiddleware } from "zipkin-instrumentation-express";
import * as fetch from "node-fetch";
import { promisify } from "util";

import * as wrap from "zipkin-instrumentation-fetch";
import * as zipkinRedis from "zipkin-instrumentation-redis";
import * as Redis from "redis";
import recorder from "../recorder";
import serviceFetchFactory from "../servicesFetch";

const router = Router();
const ctxImpl = new CLSContext("zipkin");

const localServiceName = process.env.NAME || "UNKNOWN"; // name of this application
const tracer = new Tracer({ ctxImpl, recorder, localServiceName });
const serviceFetchers = serviceFetchFactory(tracer);
const iamWrapper = wrap(fetch, { tracer, remoteServiceName: "iam" });

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
  const response = await iamWrapper("http://iam/login");
  // const response = await serviceFetchers.iam("/login");
  //   console.log("response", JSON.stringify(response, null, 2));
  const time = await redis.get("TIME");
  res.status(response.status).json(response.body);
});

router.get("/authorize", async (req, res) => {
  const response = await iamWrapper("http://iam/authorize");
  const time = await redis.get("TIME");
  res.status(response.status).json(response.body);
});

export default router;
