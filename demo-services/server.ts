import * as express from "express";
import xapiRouter from "./routers/xapi";
import iamRouter from "./routers/iam";

const port: number = 80;

const app = express();

const otherServices = {
  // DockerHost -> Service Name
  xapi: "xAPI",
  iam: "IAM",
  inventory: "Inventory",
  billing: "Billing",
  payments: "Payments"
};

// tslint:disable:next-line typedef
app.use("/ping", (_, res) => res.send("pong!\n"));
app.use("/me", (_, res) => res.json({ name: process.env.NAME }));

if (is("xAPI")) {
  app.use(xapiRouter);
} else if (is("IAM")) {
  app.use(iamRouter);
} else {
  // tslint:disable:next-line no-console
  console.log("Not mounting any particular router");
}

// tslint:disable:next-line no-console
app.listen(port, () => console.log(`Server listening on port ${port}`));

// ---

function is(name: string): boolean {
  return process.env.NAME === name;
}
