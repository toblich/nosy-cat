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
app.get("/ui", wrappedController.getGraphAsNodesAndEdges);
app.post("/graph/search", wrappedController.searchComponent);
app.patch("/graph/components/status", wrappedController.updateComponentStatus);
app.post("/graph/root-causes", wrappedController.findRootCauses);

// This endpoint is just to get a test page of the WebSocket
app.get("/ws", (_: any, res: any) => {
  res.sendFile(path.resolve("./src/ws-test.html"));
});

app.use(middlewares.globalErrorHandling);

const port = process.env.PORT || 6000;
app.set("port", port);

const http = new Server(app);
const io = socketio(http);

io.on("connection", (socket: any) => {
  logger.info("New WebSocket connection opened");
  socket.send("Pong!");

  socket.on("message", (message: socketio.Packet) => {
    logger.info(message);
    socket.send("Test");
  });
});

const server = http.listen(port, () => logger.info(`Graph listening on port ${port}`));
