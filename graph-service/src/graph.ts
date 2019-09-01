// tslint:disable: max-classes-per-file

export class Graph {
  private graph: Map<string, Set<string>>;

  constructor() {
    this.graph = new Map<string, Set<string>>();
  }

  public toObject() {
    const objectGraph = {};
    for (const [source, deps] of this.graph.entries()) {
      objectGraph[source] = Array.from(deps);
    }
    return objectGraph;
  }

  public toString() {
    return JSON.stringify(this.toObject());
  }

  public addComponent(id: string): void {
    if (this.graph.has(id)) {
      return;
    }
    this.graph.set(id, new Set());
  }

  public addDependency(from: string, to: string): void {
    if (!this.graph.has(from)) {
      this.graph.set(from, new Set([to]));
    }

    if (!this.graph.has(to)) {
      this.graph.set(to, new Set());
    }

    if (!this.graph.get(from).has(to)) {
      this.graph.get(from).add(to);
    }
  }

  public hasComponent(component: string) {
    return this.graph.has(component);
  }

  public hasDependency(from: string, to: string) {
    return this.hasComponent(from) && this.hasComponent(to) && this.getDependencies(from).has(to);
  }

  private getDependencies(component: string) {
    return this.graph.get(component);
  }
}
