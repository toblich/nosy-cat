import * as httpErrors from "http-errors";

import {
  Component as HelperComponent,
  ComponentStatus,
  ComponentPlainObject,
  ComponentCall,
  Dictionary,
  UINode,
  UIEdge,
  UIGraph,
  status,
  logger
} from "helpers";

import Repository, { Result } from "./repository";
import { Component } from "./Graph";

const defaultTestMetrics = {
  duration: 1,
  errored: true,
  timestamp: Date.now()
};

const repository = new Repository();

logger.warn("Initializing graph!");
// TODO the following promise chain is just for local testing
repository.clear().then(async () => {
  // Create graph structure
  await add([
    {
      caller: "A",
      callee: "B",
      metrics: {
        duration: 10,
        errored: true,
        timestamp: Date.now()
      }
    },
    {
      callee: "B",
      metrics: {
        duration: 20,
        errored: false,
        timestamp: Date.now()
      }
    },
    { caller: "B", callee: "C", metrics: defaultTestMetrics },
    { caller: "C", callee: "B", metrics: defaultTestMetrics },
    { caller: "C", callee: "C", metrics: defaultTestMetrics },
    { caller: "C", callee: "R", metrics: defaultTestMetrics },
    { caller: "R", callee: "S", metrics: defaultTestMetrics },
    { caller: "C", callee: "U", metrics: defaultTestMetrics },
    { caller: "U", callee: "D", metrics: defaultTestMetrics },
    { caller: "D", callee: "E", metrics: defaultTestMetrics },
    { caller: "E", callee: "G", metrics: defaultTestMetrics },
    { caller: "G", callee: "F", metrics: defaultTestMetrics },
    { caller: "F", callee: "D", metrics: defaultTestMetrics },
    { caller: "X", callee: "Y", metrics: defaultTestMetrics },
    { callee: "Z", metrics: defaultTestMetrics }
  ]);

  // Set abnormal statuses
  await Promise.all(Array.from("BCDEGFRSZ").map((id: string) => repository.setStatus(id, "Abnormal")));

  // Test root causes search
  // tslint:disable-next-line: typedef
  const rootCausesC = (await findCausalChain("C")).records.map(r => r.get("calls"));
  logger.debug(`Root causes for C: ${JSON.stringify(rootCausesC, null, 4)}`);
});

export async function clear(): Promise<Result> {
  return repository.clear();
}

export async function add(calls: ComponentCall[]): Promise<void> {
  const tx = repository.transaction();
  try {
    for (const { caller, callee, metrics } of calls) {
      await repository.addCall(caller, callee, metrics, tx);
    }
    return tx.commit();
  } catch (e) {
    logger.error(e);
    await tx.rollback();
    throw e;
  }
}

export async function search(id: string): Promise<Component> {
  return repository.getComponent(id);
}

export async function findCausalChain(initialId: string): Promise<Result> {
  const result = await repository.run(
    `
      MATCH
        p = (x:Component {id: $initialId})-[*]->(y :Component:Abnormal),
        (y)-[calls]->(),
        ()-[isCalledBy]->(y),
        (z:Component:Abnormal)
      WHERE
        NOT (y)-[]->(z)
        AND z <> y
        AND z <> x
        AND y <> x
        AND ALL(n IN NODES(p) WHERE n:Abnormal)
      RETURN DISTINCT calls, isCalledBy
    `,
    { initialId }
  );

  return result;
}

export async function getFullGraph(): Promise<Result> {
  return repository.run(`MATCH (n:Component) RETURN n`);
}
