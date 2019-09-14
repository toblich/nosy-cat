import * as express from "express";
import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";

import * as service from "./service";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

const app: express.Application = createZipkinExpress(tracer);

// tslint:disable-next-line: typedef
app.use("*", (req, res, next) => {
  logger.debug(`${coerceReqTrace(req)} => ${coerceReqDetails(req)}`);
  (req as any)._startTime = Date.now();

  const originalSend = res.send;
  (res as any).send = (body: any): void => {
    if (res.statusCode < 400) {
      const duration = Date.now() - (res.req as any)._startTime;
      logger.debug(`${coerceReqTrace(res.req)} <= ${res.statusCode} after ${duration}ms with ${toJSON(body)}`);
    }
    return originalSend.call(res, body);
  };

  next();
});

// tslint:disable-next-line: typedef
app.post("/graph", (req, res, next) => {
  try {
    req.body.map(service.add);
  } catch (e) {
    return next(e);
  }

  res.status(201).send();
});

// tslint:disable-next-line: typedef
app.get("/graph", (_, res) => {
  res.json(service.toPlainObject());
});

// tslint:disable-next-line: typedef
app.post("/graph/search", (req, res, next) => {
  let component;
  try {
    component = service.getPlain(req.body.component);
  } catch (e) {
    return next(e);
  }

  res.json(component);
});

// tslint:disable-next-line: typedef
app.use(function globalErrorHandlingMiddleware(err, req, res, _) {
  const status = err.status || 500;

  logger.error(`${coerceReqTrace(req)} ${err.stack}`);

  res.status(status).json({
    status,
    name: err.name,
    message: err.message,
    properties: err.properties || err.stack || {}
  });
});

app.listen(4000, () => logger.info("Graph listening on port 4000"));

// ---

function coerceReqTrace(req: any): string {
  return `[traceId=${req._trace_id.traceId}] [spanId=${req._trace_id.spanId}]`;
}

function coerceReqDetails(req: express.Request): string {
  return `${req.method} ${req.originalUrl} ${toJSON(req.body)}`;
}

function toJSON(body: any): string {
  return body ? JSON.stringify(body).replace(/\\"/g, "") : "no body";
}
