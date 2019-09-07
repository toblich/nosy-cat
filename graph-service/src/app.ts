import * as express from "express";
import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";

import * as service from "./service";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

const app: express.Application = createZipkinExpress(tracer);

app.post("/graph", (req, res, next) => {
  try {
    req.body.map(service.add);
  } catch (e) {
    return next(e);
  }

  res.status(201).send();
});

app.get("/graph", (req, res) => {
  res.json(service.toPlainObject());
});

app.listen(4000, () => logger.info("Graph listening on port 4000"));
