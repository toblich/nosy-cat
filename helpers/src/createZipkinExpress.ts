import * as express from "express";

import { Tracer } from "zipkin";
import { expressMiddleware } from "zipkin-instrumentation-express";

export function createZipkinExpress(tracer: Tracer): Express.Application {
  const app = express();
  app.use(express.json());

  // Add the Zipkin middleware
  app.use(expressMiddleware({ tracer }));

  return app;
}
