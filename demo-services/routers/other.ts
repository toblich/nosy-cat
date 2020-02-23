import { Router } from "express";
import * as CLSContext from "zipkin-context-cls";
import { Tracer } from "zipkin";
import { expressMiddleware as zipkinMiddleware } from "zipkin-instrumentation-express";

import recorder from "../recorder";

const router = Router();
const ctxImpl = new CLSContext("zipkin");

const localServiceName = process.env.NAME || "UNKNOWN"; // name of this application
const tracer = new Tracer({ ctxImpl, recorder, localServiceName });

// Add the Zipkin middleware
router.use(zipkinMiddleware({ tracer, port: Number(process.env.PORT) }));

// tslint:disable:typedef
router.get("/ping", (_, res) => res.send("pong!\n"));

export default router;
