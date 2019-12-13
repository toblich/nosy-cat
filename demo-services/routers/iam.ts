import { Router } from "express";
import * as CLSContext from "zipkin-context-cls";
import { Tracer, ExplicitContext, ConsoleRecorder } from "zipkin";
import { expressMiddleware as zipkinMiddleware } from "zipkin-instrumentation-express";

import * as zipkinPg from "zipkin-instrumentation-postgres";
import * as pg from "pg";
import recorder from "../recorder";

const router = Router();
const ctxImpl = new CLSContext("zipkin");

const localServiceName = process.env.NAME || "UNKNOWN"; // name of this application
const tracer = new Tracer({ ctxImpl, recorder, localServiceName });

const ZipkinPostgres = zipkinPg(tracer, pg);
const pool = new ZipkinPostgres.Pool({
  user: "postgres",
  host: "postgres",
  database: "postgres"
});

// Add the Zipkin middleware
router.use(zipkinMiddleware({ tracer, port: Number(process.env.PORT) }));

// tslint:disable:typedef
router.get("/login", async (_, res) => {
  const timestamp = await pool.query("SELECT NOW()");

  res.status(200).json({
    accessToken: "uuid"
  });
});

router.get("/authorize", async (_, res) => {
  res.status(503).json({
    message: "service down"
  });
});

export default router;
