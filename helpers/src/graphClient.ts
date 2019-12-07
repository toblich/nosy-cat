import { ComponentCall, ComponentStatus, Component } from "./types";
import * as superagent from "superagent";

interface Response<Body> extends superagent.Response {
  body: Body;
}
type PromiseRes<Body> = Promise<Response<Body>>;

class GraphClient {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  public postComponentCalls(componentCalls: ComponentCall[]): PromiseRes<{}> {
    return superagent.post(`${this.url}/graph`).send(componentCalls);
  }

  public getService(component: string): PromiseRes<Component> {
    const requestBody = { component };

    return superagent.post(`${this.url}/graph/search`).send(requestBody);
  }

  public updateServiceMetrics(componentId: string, status: ComponentStatus): PromiseRes<{}> {
    const requestBody = { component: componentId, status };

    return superagent.patch(`${this.url}/graph/components/status`).send(requestBody);
  }
}

const generateGraphClient = (url: string): GraphClient => new GraphClient(url);

export { generateGraphClient };
