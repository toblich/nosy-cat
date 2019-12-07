import * as fetch from "node-fetch";
import * as wrap from "zipkin-instrumentation-fetch";
import { mapValues } from "lodash";

const services = {
  // DockerHost -> Service Name
  xapi: "xAPI",
  iam: "IAM",
  inventory: "Inventory",
  billing: "Billing",
  payments: "Payments"
};

// tslint:disable:next-line: typedef
const fetchFor = domain => (path, ...args) => fetch(`http://${domain}${path}`, ...args);

// tslint:disable:next-line: typedef
export default tracer => mapValues(services, (name, domain) => wrap(fetchFor(domain), { tracer, name }));
