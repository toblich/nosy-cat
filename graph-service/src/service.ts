import { ComponentCall, ComponentStatus, Dictionary, logger, status } from "helpers";
import { flatMap, keyBy, pickBy, takeRightWhile, uniqBy } from "lodash";
import { inspect } from "util";
import Repository, { Component, Transaction } from "./repository";

//////////////////////
// --- Types ---
//////////////////////

export interface Node {
  id: string;
  dependencies: string[];
  depsSet: Set<string>;
  status: ComponentStatus;
}

//////////////////////////
// --- Initialization ---
//////////////////////////

const repository = new Repository();

const DEFAULT_TRANSITIONING_THRESHOLD = parseInt(process.env.TRANSITIONING_THRESHOLD || "3", 10);
const DEFAULT_INITIALIZING_THRESHOLD = parseInt(process.env.INITIALIZING_THRESHOLD || "30", 10);

type Thresholds = Record<ComponentStatus.NORMAL | ComponentStatus.CONFIRMED | ComponentStatus.INITIALIZING, number>;
let _thresholds: Thresholds = {
  [ComponentStatus.NORMAL]: DEFAULT_TRANSITIONING_THRESHOLD,
  [ComponentStatus.CONFIRMED]: DEFAULT_TRANSITIONING_THRESHOLD,
  [ComponentStatus.INITIALIZING]: DEFAULT_INITIALIZING_THRESHOLD,
};
export function setTransitioningThresholds(thresholds: Thresholds): void {
  _thresholds = thresholds;
}

///////////////////////////
// --- Service methods ---
///////////////////////////

export async function clear(): Promise<void> {
  return repository.clear();
}

export async function add(calls: ComponentCall[], isServiceReady: boolean = false): Promise<void> {
  return transact(async (tx: Transaction) => {
    for (const { caller, callee } of calls) {
      await repository.addCall(caller, callee, tx, isServiceReady);
    }
  });
}

export async function search(id: string): Promise<Component> {
  return repository.getComponent(id);
}

async function getAbnormalSubgraph(initialId: string, tx?: Transaction): Promise<Dictionary<Node>> {
  const chain = await repository.getAbnormalChain(initialId, tx);
  return chain.length === 0 ? {} : await toGraph(initialId, chain, tx);
}

export interface Change {
  id: string;
  from: { status: ComponentStatus };
  to: { status: ComponentStatus };
}

export async function updateComponentStatus(id: string, newStatus: ComponentStatus): Promise<Dictionary<Change>> {
  const isNormal = status.isNormal(newStatus);
  return transact(async (tx: Transaction) => {
    await repository.acquireExclusiveLock(tx);
    const { status: currentStatus, transitionCounter } = await repository.getComponent(id, tx);
    const wasNormal = status.isNormal(currentStatus);
    logger.debug(`Previous Status: ${currentStatus} - newStatus: ${newStatus}`);

    const updatedCounter = transitionCounter + 1;

    if (
      currentStatus === ComponentStatus.INITIALIZING &&
      transitionCounter < _thresholds[ComponentStatus.INITIALIZING]
    ) {
      logger.debug(`Incrementing transitionCounter to ${updatedCounter} for ${id}`);
      await repository.setTransitionCounter(id, updatedCounter, tx);
      return {}; // There was no status change
    } else if (
      currentStatus === ComponentStatus.INITIALIZING &&
      transitionCounter === _thresholds[ComponentStatus.INITIALIZING]
    ) {
      logger.debug(`Set status normal for the ex new node: ${id}`);
      await repository.setStatus(id, ComponentStatus.NORMAL, tx, { resetCounter: true });
      return {
        [id]: {
          id,
          from: { status: ComponentStatus.INITIALIZING },
          to: { status: ComponentStatus.NORMAL },
        },
      };
    }

    if (wasNormal === isNormal) {
      if (transitionCounter !== 0) {
        logger.debug(`Abort transitioning for component ${id}`);
        await repository.setTransitionCounter(id, 0, tx);
        return {}; // There was no status change
      }

      logger.debug("Not updating because status has not changed and it was not transitioning");
      // There was no change
      return {};
    }

    const transitionThreshold = wasNormal
      ? _thresholds[ComponentStatus.CONFIRMED]
      : _thresholds[ComponentStatus.NORMAL];
    if (updatedCounter < transitionThreshold) {
      logger.debug(`Incrementing transitionCounter to ${updatedCounter} for ${id}`);
      await repository.setTransitionCounter(id, updatedCounter, tx);
      return {}; // There was no status change
    }

    await repository.setStatus(id, newStatus, tx, { resetCounter: true });
    logger.debug(`isNormal: ${isNormal}`);
    const initialNodeChange: Change = { id, from: { status: currentStatus }, to: { status: newStatus } };

    // Changing from NORMAL to CONFIRMED
    if (!isNormal) {
      // Mark perpetrators that called the new CONFIRMED node as victims
      const perpetratorCallerIds = await repository.getPerpetratorIDsChain(id, tx);
      await Promise.all(
        perpetratorCallerIds.map((perpId: string) => repository.setStatus(perpId, ComponentStatus.VICTIM, tx))
      );
      const initialChangesToPerp = perpetratorCallerIds.map((perp: string) => ({
        id: perp,
        from: { status: ComponentStatus.PERPETRATOR },
        to: { status: ComponentStatus.VICTIM },
      }));

      const newChanges = await setNewPerpetratorsAndVictims(id, tx); // Analyze the chain beginning from the new CONFIRMED to determine perpetrators and victims

      const changes: Change[] = [initialNodeChange, ...initialChangesToPerp, ...newChanges];

      return toMergedChangeDict(changes);
    }

    // Changing from some abnormal status to NORMAL
    // Mark victims that called the new NORMAL node as perpetrators
    const victimCallerIds = await repository.getCallerIDsWithStatus(id, ComponentStatus.VICTIM, tx);

    // For cases with cycles, perps might be calling the used-to-be-perp node too
    const perpCallerIds = await repository.getPerpetratorIDsChain(id, tx);

    const otherChanges: Change[] = (
      await Promise.all(
        victimCallerIds.concat(perpCallerIds).map((vid: string) => setNewPerpetratorsAndVictims(vid, tx))
      )
    ).flat();

    return toMergedChangeDict([initialNodeChange, ...otherChanges]);
  });
}

function toMergedChangeDict(changes: Change[]): Dictionary<Change> {
  const mergedChanges = changes.reduce((accum: Dictionary<Change>, change: Change) => {
    const original = accum[change.id];
    // If there are two changes applied to the same node, merge them.
    accum[change.id] = !original
      ? change
      : {
          id: change.id,
          from: original.from,
          to: change.to,
        };
    return accum;
  }, {});

  // Filter out changes that (after merging perhaps) became idempotent, so not a real change
  return pickBy(mergedChanges, (change: Change) => change.from.status !== change.to.status);
}

async function setNewPerpetratorsAndVictims(id: string, tx: Transaction): Promise<Change[]> {
  const abnormalSubgraph = await getAbnormalSubgraph(id, tx);
  logger.debug("ABNORMAL SUBGRAPH: " + inspect(abnormalSubgraph, false, 3));

  const ends = findEnds(id, abnormalSubgraph);
  logger.debug("ENDS: " + inspect(ends, false, 3));

  const newPerpetrators = expandSupernodes(
    Object.values(abnormalSubgraph).filter(
      (x: Node) => x.status !== ComponentStatus.PERPETRATOR && ends.some((end: Node) => x.id === end.id)
    )
  );
  logger.debug("newPerpetrators: " + inspect(newPerpetrators, false, 3));

  const newVictims = expandSupernodes(
    Object.values(abnormalSubgraph).filter(
      (x: Node) => x.status !== ComponentStatus.VICTIM && !ends.some((end: Node) => x.id === end.id)
    )
  );
  logger.debug("newVictims: " + inspect(newVictims, false, 3));

  await Promise.all([
    updateStatuses(newPerpetrators, ComponentStatus.PERPETRATOR, tx),
    updateStatuses(newVictims, ComponentStatus.VICTIM, tx),
  ]);

  return asChanges(newPerpetrators, ComponentStatus.PERPETRATOR).concat(asChanges(newVictims, ComponentStatus.VICTIM));
}

async function updateStatuses(nodes: Node[], newStatus: ComponentStatus, tx?: Transaction): Promise<void> {
  await Promise.all(nodes.map((x: Node) => repository.setStatus(x.id, newStatus, tx)));
}

function asChanges(nodes: Node[], newStatus: ComponentStatus): Change[] {
  return nodes.map((x: Node) => ({ id: x.id, from: { status: x.status }, to: { status: newStatus } }));
}

/////////////////////
// -- Private ---
/////////////////////

interface Supernode extends Node {
  nodes: Node[];
}

async function transact<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = repository.transaction();

  try {
    const result = await fn(tx);
    if (tx.isOpen()) {
      await tx.commit();
    }
    return result;
  } catch (e) {
    logger.error(e);
    if (tx.isOpen()) {
      await tx.rollback();
    }
    throw e;
  }
}

async function toGraph(
  initialId: string,
  nodes: { id: string; status: ComponentStatus }[],
  tx?: Transaction
): Promise<Dictionary<Node>> {
  const ids = [initialId, ...nodes.map((n: Node) => n.id)];
  const relationships = await repository.getDependenciesBetween(ids, tx);

  const nodesById = keyBy(nodes, "id") as Dictionary<Node>;
  // At this point, `nodesBysId` are actually still missing the dependencies to really be Node elements
  // So, go on to build those dependencies and depsSet
  for (const { callerId, calleeId } of relationships) {
    if (nodesById[callerId].dependencies) {
      nodesById[callerId].dependencies.push(calleeId);
    } else {
      nodesById[callerId].dependencies = [calleeId];
    }
  }
  for (const id of ids) {
    if (!nodesById[id].dependencies) {
      nodesById[id].dependencies = [];
    }
    nodesById[id].depsSet = new Set(nodesById[id].dependencies);
  }

  return nodesById;
}

function findEnds(initialId: string, subgraph: Dictionary<Node>): Node[] {
  const component = subgraph[initialId];
  if (!component) {
    // Either the component is in Normal status (therefore, not in the abnormal subgraph)
    // or it's not present at all. In the latter, it would be nice to throw an error, but
    // we don't have enough info here yet (only abnormal nodes are present here).
    logger.warn(
      `${initialId} was not found when looking for root causes in graph ${JSON.stringify(subgraph, null, 4)}`
    );
    return [];
  }

  // * These two steps break the subgraph, as we cannot yet rebuild the original dependencies
  // *given that we've merged cycles into supernodes
  logger.info(`Abnormal subgraph before DFS ${inspect(subgraph, false, 3)}`);
  const ends = internalDFS(subgraph, initialId);
  logger.info(`Abnormal subgraph after DFS ${inspect(subgraph, false, 3)}`);

  return uniqBy(flatMap(ends), "id");
}

function internalDFS(
  subgraph: Dictionary<Node>,
  id: string,
  visited: Set<string> = new Set(),
  path: Node[] = [],
  parentId: string = null
): Node[] {
  let component: Node = subgraph[id];

  if (!component || (parentId && !subgraph[parentId])) {
    // Case for when accessing a node that has been merged into a supernode
    return [];
  }

  if (visited.has(id)) {
    // * Cycle detected!
    // Since the path array has the ordered list of components visited to reach the current component,
    // take the components visited since the first time that we visited the current one. That's the cycle
    // that has formed and was detected.
    const cycle = takeRightWhile(path, (c: Node): boolean => c.id !== component.id);
    cycle.push(component);
    const cycleIds = cycle.map((n: Node) => n.id);
    const cycleIdsSet = new Set(cycleIds);

    // Create supernode
    const supernodeId = toSupernodeId(cycleIds);
    const supernodeDepsSet = new Set(
      flatMap(cycle, (n: Node) => n.dependencies.filter((d: string) => !cycleIdsSet.has(d)))
    );
    const supernode: Supernode = {
      id: supernodeId,
      dependencies: Array.from(supernodeDepsSet),
      depsSet: supernodeDepsSet,
      nodes: cycle,
      status: ComponentStatus.CONFIRMED,
    };

    // Remove existing nodes of the cycle merged into supernode from the graph an the visited set
    // Also mark dependencies as not visited
    for (const cycleId of cycleIds) {
      visited.delete(cycleId);
      for (const depId of subgraph[cycleId].dependencies) {
        visited.delete(depId);
      }
      delete subgraph[cycleId];
    }
    // Remove all visited nodes that are path of the cycle, as they will be re-added as just the supernode
    path.splice(path.length - cycle.length);

    // For nodes that depended on something in the cycle, change that dep to be on the supernode
    for (const node of Object.values(subgraph)) {
      // * Here we're mutating the deps and we cannot later reconstruct the original deps as we cannot
      // * differentiate to which subnode of the supernode the dependency aimed.
      node.depsSet = new Set(node.dependencies.map((dep: string) => (cycleIdsSet.has(dep) ? supernodeId : dep)));
      node.dependencies = Array.from(node.depsSet);
    }

    // Add supernode to graph
    subgraph[supernodeId] = supernode;

    // Set supernode as current component being visited
    component = supernode;
  }

  visited.add(component.id);

  if (!component.dependencies || component.dependencies.length === 0) {
    return [component];
  }

  path.push(component);
  return flatMap(component.dependencies, (depId: string) => internalDFS(subgraph, depId, visited, path, component.id));
}

function expandSupernodes(nodes: Node[]): Node[] {
  // * This does not fully rebuild the previous links, as we've lost information of the specific dependencies
  // * inside the supernodes
  // * Shallow copy to avoid side-effects over iterating list to break the loop
  for (const node of [...nodes]) {
    if (isRegularNodeId(node.id)) {
      continue;
    }
    expandSingleSupernode(node as Supernode, nodes);
  }
  logger.debug(`expand supernodes subgraph ${inspect(nodes, null, 3)}`);
  return nodes.filter((n: Node | Supernode) => isRegularNodeId(n.id));
}

function expandSingleSupernode(supernode: Supernode, nodes: Node[]): void {
  for (const subnode of supernode.nodes) {
    logger.debug(`Splitting ${subnode.id} from ${supernode.id} and setting status ${supernode.status}`);
    subnode.status = supernode.status === ComponentStatus.CONFIRMED ? subnode.status : supernode.status; // Copy the status of the supernode into all child nodes // TODO
    nodes.push(subnode);
    if (isSupernodeId(subnode.id)) {
      expandSingleSupernode(subnode as Supernode, nodes);
    }
  }
}

const SUPERNODE_PREFIX = "__supernode_cycle";
const SUPERNODE_SEPARATOR = "...";

// begins with prefix - separator - nodeId - separator - (non-empty tail)
// The tail should follow the id-separator-id pattern but is not checked)
const SUPERNODE_REGEX = new RegExp([`^${SUPERNODE_PREFIX}`, ".*", "."].join(SUPERNODE_SEPARATOR));

function isSupernodeId(id: string): boolean {
  return SUPERNODE_REGEX.test(id);
}

function isRegularNodeId(id: string): boolean {
  return !isSupernodeId(id);
}

function toSupernodeId(ids: string[]): string {
  return [SUPERNODE_PREFIX, ...ids].join(SUPERNODE_SEPARATOR);
}

export async function getFullGraph(): Promise<Dictionary<Component & { dependencies: string[] }>> {
  const ids = await repository.getAllIDs();
  const components = (await Promise.all(ids.map((id: string) => repository.getComponent(id)))).map((c: Component) =>
    Object.assign(c, { dependencies: Array.from(c.dependencies) })
  );
  return keyBy(components, "id");
}
