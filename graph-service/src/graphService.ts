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

const repository = new Repository();
repository
  .clear()
  .then(() =>
    add([
      {
        caller: "xapi",
        callee: "iam",
        metrics: {
          duration: 10,
          errored: true,
          timestamp: Date.now()
        }
      }
    ])
  )
  .then(() =>
    add([
      {
        callee: "iam",
        metrics: {
          duration: 20,
          errored: false,
          timestamp: Date.now()
        }
      }
    ])
  );

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
