type ComponentID = string;

export class Graph {
  private graph: Map<ComponentID, Set<ComponentID>>;

  constructor() {
    this.graph = new Map<ComponentID, Set<ComponentID>>();
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

  public addComponent(id: ComponentID): void {
    if (this.graph.has(id)) {
      return;
    }
    this.graph.set(id, new Set());
  }

  public addDependency(from: ComponentID, to: ComponentID): void {
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

  public hasComponent(component: ComponentID) {
    return this.graph.has(component);
  }

  public hasDependency(from: ComponentID, to: ComponentID) {
    return this.hasComponent(from) && this.hasComponent(to) && this.getDependencies(from).has(to);
  }

  private getDependencies(component: ComponentID) {
    return this.graph.get(component);
  }
}
