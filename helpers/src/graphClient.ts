import { ComponentCall, GraphServiceRequestBody } from "./types";

class GraphClient {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  public postComponentCalls = (componentCalls: ComponentCall[]) => {
    const requestBody: GraphServiceRequestBody = { componentCalls };

    return fetch(`${this.url}/graph`, {
      method: "POST",
      body: JSON.stringify(requestBody)
    });
  };
}

export { GraphClient };
