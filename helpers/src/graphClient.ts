import { ComponentCall, ComponentStatus, ComponentCallMetrics } from "./types";
import * as superagent from "superagent";
import { logger } from "./logger";

interface Response<Body> extends superagent.Response {
  body: Body;
}
type PromiseRes<Body> = Promise<Response<Body>>;

interface Component {
  [componentId: string]: {
    dependencies: string[];
    status: ComponentStatus;
    metrics: ComponentCallMetrics;
  };
}

class GraphClient {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  public postComponentCalls(componentCalls: ComponentCall[]): PromiseRes<{}> {
    return superagent.post(`${this.url}/graph`).send(componentCalls);
  }

  public getService(serviceName: string): PromiseRes<Component> {
    const requestBody = { serviceName };

    return superagent.post(`${this.url}/graph/search`).send(requestBody);
  }
}

export { GraphClient };
