import * as express from "express";
import { ping } from "./kafka-integration";

const app: express.Application = express();

app.get("/ping", (req, res) => {
  ping();
  res.send("pong");
});

// tslint:disable-next-line: no-console
app.listen(3000, () => console.log("Listening on port 3000"));
