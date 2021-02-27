import { ComponentStatus, ComponentPlainObject } from "helpers";

// Make all nodes have the label Component
// Then, make them all have another label (or property?) with the status
// All of them should have a property "id: string"
// Then, have an index on Component(id)
// and a constraint on uniqueness of Component(id)

// All relations should have the same relation type - CALLS

export class Component {
  public id: string;
  public dependencies: Set<string>;
  public consumers: Set<string>;
  public status: ComponentStatus;
  public transitionCounter: number;

  constructor(
    id: string,
    dependencies: Set<string> = new Set(),
    consumers: Set<string> = new Set(),
    status: ComponentStatus = ComponentStatus.NORMAL,
    transitionCounter: number = 0
  ) {
    this.id = id;
    this.dependencies = dependencies;
    this.consumers = consumers;
    this.status = status;
    this.transitionCounter = transitionCounter;
  }

  public dependsOn(id: string): boolean {
    return this.dependencies.has(id);
  }

  public isConsumedBy(id: string): boolean {
    return this.consumers.has(id);
  }

  public addDependency(id: string): void {
    this.dependencies.add(id);
  }

  public addConsumer(id: string): void {
    this.consumers.add(id);
  }

  public toPlainObject(): ComponentPlainObject {
    return {
      id: this.id,
      dependencies: Array.from(this.dependencies),
      consumers: Array.from(this.consumers),
      status: this.status,
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

  public isConsumerBy(_: string): boolean {
    return false;
  }

  public addDependency(_: string): void {
    return;
  }

  public addConsumer(_: string): void {
    return;
  }

  public toPlainObject(): null {
    return null;
  }
}

// ---

interface GraphPlainObject {
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
      this.graph.set(from, new Component(from, new Set([to])));
    }
    if (!this.graph.has(to)) {
      this.graph.set(to, new Component(to, new Set(), new Set([from])));
    } else {
      this.graph.get(to).addConsumer(from);
    }
    if (!this.hasDependency(from, to)) {
      this.getComponent(from).addDependency(to);
      this.getComponent(to).addConsumer(from);
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
