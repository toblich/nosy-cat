import * as express from "express";

import { Tracer } from "zipkin";
import { expressMiddleware } from "zipkin-instrumentation-express";

export function createZipkinExpress(tracer: Tracer) {
  const app = express();

  // Add the Zipkin middleware
  app.use(expressMiddleware({ tracer }));

  return app;
}