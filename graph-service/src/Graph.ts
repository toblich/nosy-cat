import { ComponentStatus, ComponentPlainObject } from "helpers";

class Component {
  public id: string;
  public dependencies: Set<string>;
  public status: ComponentStatus;

  constructor(id: string, dependencies: Set<string> = new Set(), status: ComponentStatus = ComponentStatus.NORMAL) {
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

  public toPlainObject(): ComponentPlainObject {
    return {
      id: this.id,
      dependencies: Array.from(this.dependencies),
      status: this.status
    };
  }
}

class MissingComponent extends Component {
  constructor() {
    super("MissingComponent");
  }

  public dependsOn(_: string): boolean {
    return false;
  }

  public addDependency(_: string): void {
    return;
  }

  public toPlainObject(): null {
    return null;
  }
}

// ---

export interface GraphPlainObject {
  [id: string]: ComponentPlainObject;
}

export class Graph {
  private graph: Map<string, Component>;

  constructor() {
    this.graph = new Map<string, Component>();
  }

  public toPlainObject(): GraphPlainObject {
    const objectGraph = {};
    for (const [source, component] of this.graph.entries()) {
      const plainComponent = component.toPlainObject();
      delete plainComponent.id;
      objectGraph[source] = plainComponent;
    }
    return objectGraph;
  }

  public toString(): string {
    return JSON.stringify(this.toPlainObject(), null, 4);
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
    if (!this.hasDependency(from, to)) {
      this.getComponent(from).addDependency(to);
    }
  }

  public hasComponent(id: string): boolean {
    return this.graph.has(id);
  }

  public hasDependency(from: string, to: string): boolean {
    return this.hasComponent(from) && this.hasComponent(to) && this.getComponent(from).dependsOn(to);
  }

  public getComponent(id: string): Component {
    return this.graph.get(id) || new MissingComponent();
  }
}
