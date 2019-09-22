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

const port = process.env.PORT || 4000;
app.listen(port, () => logger.info(`Graph listening on port ${port}`));
