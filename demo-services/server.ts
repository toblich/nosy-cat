import * as express from "express";
import xapiRouter from "./routers/xapi";
import iamRouter from "./routers/iam";
import otherRouter from "./routers/other";

const port: number = 80;

const app = express();

const otherServices = {
  // DockerHost -> Service Name
  xapi: "xapi",
  iam: "iam",
  inventory: "inventory",
  billing: "billing",
  payments: "payments"
};

// tslint:disable:next-line typedef
app.use("/", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "http://localhost:3001");
  next();
});

// tslint:disable:next-line typedef
app.use("/me", (_, res) => res.json({ name: process.env.NAME }));

if (is("xapi")) {
  app.use(xapiRouter);
} else if (is("iam")) {
  app.use(iamRouter);
} else {
  // tslint:disable:next-line no-console
  app.use(otherRouter);
}

// tslint:disable:next-line no-console
app.listen(port, () => console.log(`Server listening on port ${port}`));

// ---

function is(name: string): boolean {
  return process.env.NAME === name;
}
