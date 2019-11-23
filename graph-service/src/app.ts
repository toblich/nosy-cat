import { Server } from "http";
import * as express from "express";
import * as socketio from "socket.io";
import * as path from "path";

import { logger, createZipkinContextTracer, createZipkinExpress } from "helpers";
import { mapValues } from "lodash";

import * as controller from "./controller";
import * as middlewares from "./middlewares";

const { tracer } = createZipkinContextTracer("graph-service");

// ---

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
// Create express, server, and socketio
////////////////////
const app: express.Application = createZipkinExpress(tracer);
const port = process.env.PORT || 6000;
app.set("port", port);
const http = new Server(app);
const io = socketio(http);

////////////////////
// Set express routes
////////////////////
app.use(middlewares.logging);

app.post("/graph", wrappedController.addComponentsAndDependencies, emitGraph);
app.get("/graph", wrappedController.getGraphAsJson);
app.get("/ui", wrappedController.getGraphAsNodesAndEdges);
app.post("/graph/search", wrappedController.searchComponent);
app.patch("/graph/components/status", wrappedController.updateComponentStatus, emitGraph);
app.post("/graph/root-causes", wrappedController.findRootCauses);

// This endpoint is just to get a test page of the WebSocket
app.get("/ws", (_: any, res: any) => {
  res.sendFile(path.resolve("./src/ws-test.html"));
});

app.use(middlewares.globalErrorHandling);

////////////////////
// Set some SocketIO stuff on connection, mainly for debugging
////////////////////
io.on("connection", async () => {
  logger.info("New WebSocket connection opened");
  await emitGraph();
});

////////////////////
// Actually start the server
////////////////////
const server = http.listen(port, () => logger.info(`Graph listening on port ${port}`));

async function emitGraph(): Promise<void> {
  const graph = await controller.wsGraphAsNodesAndEdges();
  logger.info("Emitting graph");
  io.sockets.emit("graph", graph);
}
