import * as express from "express";
import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";
import { mapValues } from "lodash";

import * as controller from "./controller";
import * as middlewares from "./middlewares";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

const wrappedController = mapValues(controller, (originalMethod: express.RequestHandler) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    try {
      originalMethod(req, res, next);
    } catch (e) {
      next(e);
      return;
    }
  };
});

const app: express.Application = createZipkinExpress(tracer);

app.use(middlewares.logging);

app.post("/graph", wrappedController.addComponentsAndDependencies);
app.get("/graph", wrappedController.getGraphAsJson);
app.post("/graph/search", wrappedController.searchComponent);
app.patch("/graph/components/status", wrappedController.updateComponentStatus);
app.post("/graph/root-causes", wrappedController.findRootCauses);

app.use(middlewares.globalErrorHandling);

const port = process.env.PORT || 6000;
app.listen(port, () => logger.info(`Graph listening on port ${port}`));
