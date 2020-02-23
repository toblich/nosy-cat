import * as fetch from "node-fetch";
import * as wrap from "zipkin-instrumentation-fetch";
import { mapValues } from "lodash";

const services = {
  // DockerHost -> Service Name
  xapi: "xapi",
  iam: "iam",
  inventory: "inventory",
  billing: "billing",
  payments: "payments"
};

// tslint:disable:next-line: typedef
const fetchFor = domain => (path, ...args) => fetch(`http://${domain}${path}`, ...args);

// tslint:disable:next-line: typedef
export default tracer =>
  mapValues(services, (remoteServiceName, domain) => wrap(fetchFor(domain), { tracer, remoteServiceName }));
