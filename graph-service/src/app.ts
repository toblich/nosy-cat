import * as express from "express";
import * as httpErrors from "http-errors";
import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";

import { Graph } from "./graph";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

const app: express.Application = createZipkinExpress(tracer);

const graph = new Graph();

app.post("/graph", (req, res, next) => {
  logger.info("body", req.body);
  try {
    add(req.body);
  } catch (e) {
    return next(e);
  }

  res.status(201).send();
});

app.post("/bulk/graph", (req, res, next) => {
  try {
    req.body.map(add);
  } catch (e) {
    return next(e);
  }

  res.status(201).send();
});

app.get("/graph", (req, res) => {
  res.json(graph.toObject());
});

app.listen(4000, () => logger.info("Graph listening on port 4000"));

// --- Graph Service ---
interface ComponentCall {
  caller?: string;
  callee?: string;
}
function add({ caller, callee }: ComponentCall) {
  if (caller && callee) {
    graph.addDependency(caller, callee);
  } else if (caller) {
    graph.addComponent(caller);
  } else if (callee) {
    graph.addComponent(callee);
  } else {
    throw new httpErrors.BadRequest('The request, must contain a "caller" and/or a "callee"');
  }
}
