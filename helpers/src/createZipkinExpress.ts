import * as express from "express";
import * as bodyParser from "body-parser";

import { Tracer } from "zipkin";
import { expressMiddleware } from "zipkin-instrumentation-express";

export function createZipkinExpress(tracer: Tracer) {
  const app = express();
  app.use(bodyParser.json());

  // Add the Zipkin middleware
  app.use(expressMiddleware({ tracer }));

  return app;
}
