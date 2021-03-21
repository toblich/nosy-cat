import * as express from "express";
import { logger } from "helpers";

// tslint:disable-next-line: typedef
export function logging(req, res, next) {
  logger.debug(`${coerceReqTrace(req)} => ${coerceReqDetails(req)}`);
  req._startTime = Date.now();

  const originalSend = res.send;
  res.send = (body: any): express.Response => {
    if (res.statusCode < 400) {
      const duration = Date.now() - res.req._startTime;
      logger.debug(`${coerceReqTrace(res.req)} <= ${res.statusCode} after ${duration}ms with ${toJSON(body)}`);
    }
    return originalSend.call(res, body);
  };

  next();
}

// tslint:disable-next-line: typedef
export function globalErrorHandling(err, req, res, _) {
  const status = err.status || 500;

  logger.error(`${coerceReqTrace(req)} ${err.stack}`);

  res.status(status).json({
    status,
    name: err.name,
    message: err.message,
    properties: err.properties || err.stack || {},
  });
}

// --- Helper functions ---

function coerceReqTrace(req: any): string {
  return `[traceId=${req._trace_id.traceId}] [spanId=${req._trace_id.spanId}]`;
}

function coerceReqDetails(req: express.Request): string {
  return `${req.method} ${req.originalUrl} ${toJSON(req.body)}`;
}

function toJSON(body: any): string {
  if (body === undefined) {
    return "no body";
  }

  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body);
}
