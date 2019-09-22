import { ComponentCall } from "./types";
import * as superagent from "superagent";

class GraphClient {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  public postComponentCalls = (componentCalls: ComponentCall[]): Promise<superagent.Response> => {
    return superagent.post(`${this.url}/graph`).send(componentCalls);
  };

  public getService = (serviceName: string): Promise<superagent.Response> => {
    const requestBody = { serviceName };

    return superagent.post(`${this.url}/graph/search`).send(requestBody);
  };
}

export { GraphClient };
