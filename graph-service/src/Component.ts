import { ComponentStatus } from "helpers";

// Make all nodes have the label Component
// Then, make them all have another label (or property?) with the status
// All of them should have a property "id: string"
// Then, have an index on Component(id)
// and a constraint on uniqueness of Component(id)

// All relations should have the same relation type - CALLS

export interface Component {
  id: string;
  dependencies: Set<string>;
  consumers: Set<string>; // TODO consider removing this
  status: ComponentStatus;
  transitionCounter: number;
}
