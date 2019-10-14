import * as express from "express";
import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";
import { mapValues } from "lodash";

import * as controller from "./controller";
import * as middlewares from "./middlewares";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

interface Controller {
  [functionName: string]: any;
}
const wrappedController: Controller = mapValues(controller, (originalMethod: express.RequestHandler) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
    try {
      await originalMethod(req, res, next);
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
