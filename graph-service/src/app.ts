import * as express from "express";
import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";

import * as controller from "./controller";
import * as middlewares from "./middlewares";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

const app: express.Application = createZipkinExpress(tracer);

app.use(middlewares.logging);

app.post("/graph", controller.addComponentsAndDependencies);
app.get("/graph", controller.getGraphAsJson);
app.post("/graph/search", controller.searchComponent);

app.use(middlewares.globalErrorHandling);

app.listen(4000, () => logger.info("Graph listening on port 4000"));
