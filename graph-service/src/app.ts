import * as express from "express";
import { createZipkinContextTracer, createZipkinExpress, logger } from "helpers";
import { Server } from "http";
import { mapValues } from "lodash";
import * as controller from "./controller";
import * as middlewares from "./middlewares";
import Repository from "./repository";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

if (!process.env.NEO4J_HOST) {
  throw Error("NEO4J_HOST must be set!");
}
// tslint:disable-next-line: no-unused-expression
new Repository(); // TODO

////////////////////
// Wrap controller
////////////////////
interface Controller {
  [functionName: string]: any;
}
const wrappedController: Controller = mapValues(controller, (originalMethod: express.RequestHandler) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
    try {
      await originalMethod(req, res, next);
      // Call next middleware, which even if the caller got its response might do other stuff
      // like updating clients on WebSockets
      next();
    } catch (e) {
      next(e);
      return;
    }
  };
});

////////////////////
// Create express, server
////////////////////
const app: express.Application = createZipkinExpress(tracer);
const port = process.env.PORT || 4000;
app.set("port", port);
// tslint:disable-next-line:typedef
app.use("/", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3001");
  next();
});
const http = new Server(app);

////////////////////
// Set express routes
////////////////////
app.use(middlewares.logging);

app.post("/graph", wrappedController.addComponentsAndDependencies);
app.get("/graph", wrappedController.getGraphAsJson);
app.delete("/graph", wrappedController.resetGraph);
app.post("/graph/search", wrappedController.searchComponent);
app.patch("/graph/components/status", wrappedController.updateComponentStatus);

app.use(middlewares.globalErrorHandling);

////////////////////
// Actually start the server
////////////////////
const server = http.listen(port, () => logger.info(`Graph listening on port ${port}`));
