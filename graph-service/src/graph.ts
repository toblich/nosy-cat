// tslint:disable: max-classes-per-file

export enum Status {
  OK = "OK",
  ANOMALOUS = "ANOMALOUS"
}

// ---

export class Component {
  public id: string;
  public dependencies: Set<string>;
  public status: Status;

  constructor(id: string, dependencies: Set<string> = new Set(), status: Status = Status.OK) {
    this.id = id;
    this.dependencies = dependencies;
    this.status = status;
  }

  public dependsOn(id: string): boolean {
    return this.dependencies.has(id);
  }

  public addDependency(id: string): void {
    this.dependencies.add(id);
  }

  public toPlainObject(): any {
    return {
      id: this.id,
      dependencies: Array.from(this.dependencies),
      status: this.status
    };
  }
}

// ---

export class Graph {
  private graph: Map<string, Component>;

  constructor() {
    this.graph = new Map<string, Component>();
  }

  public toPlainObject(): any {
    const objectGraph = {};
    for (const [source, component] of this.graph.entries()) {
      const plainComponent = component.toPlainObject();
      delete plainComponent.id;
      objectGraph[source] = plainComponent;
    }
    return objectGraph;
  }

  public toString(): string {
    return JSON.stringify(this.toPlainObject());
  }

  public addComponent(id: string): void {
    if (this.graph.has(id)) {
      return;
    }
    this.graph.set(id, new Component(id));
  }

  public addDependency(from: string, to: string): void {
    if (!this.graph.has(from)) {
      this.graph.set(from, new Component(from, new Set(to)));
    }
    if (!this.graph.has(to)) {
      this.graph.set(to, new Component(to));
    }
    if (!this.graph.get(from).dependencies.has(to)) {
      this.graph.get(from).addDependency(to);
    }
  }

  public hasComponent(id: string): boolean {
    return this.graph.has(id);
  }

  public hasDependency(from: string, to: string): boolean {
    return this.hasComponent(from) && this.hasComponent(to) && this.getComponent(from).dependsOn(to);
  }

  private getComponent(id: string): Component {
    return this.graph.get(id);
  }
}
