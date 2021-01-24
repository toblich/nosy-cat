import { logger, ComponentCallMetrics, ComponentStatus as STATUS, status as statusUtils } from "helpers";
import * as neo4j from "neo4j-driver";
import { Component } from "./Graph";
import { Request } from "express";
import { inspect } from "util";

export type Result = neo4j.QueryResult;
export type Record = neo4j.Record;
export type Transaction = neo4j.Transaction & { debugId?: number };

export default class Repository {
  private driver = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic("neo4j", "bitnami"));
  private static VIRTUAL_NODE = "VIRTUAL_NODE";

  public constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.run("CREATE CONSTRAINT Component_id_unique on (x:Component) ASSERT x.id IS UNIQUE");
    } catch (error) {
      if ((error as neo4j.Neo4jError).code === "Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists") {
        logger.warn("'Component_id_unique' constraint already exists!");
      } else {
        throw error;
      }
    }
    await this.run(`MERGE (x:${Repository.VIRTUAL_NODE}) ON CREATE SET x.flag = 0`);
  }

  private session(...args: any): neo4j.Session {
    return this.driver.session(...args);
  }

  // public async transact<T>(fn: (_: Transaction) => Promise<T>): Promise<T> {
  //   logger.error(await this.driver.supportsTransactionConfig());
  //   const session = this.session();
  //   const result = await session.writeTransaction(fn);
  //   await session.close();
  //   return result;
  // }

  public transaction(): Transaction {
    const session = this.session({ defaultAccessMode: neo4j.session.WRITE });
    const tx: Transaction = session.beginTransaction();
    const commit = tx.commit.bind(tx);
    tx.commit = async (): Promise<void> => {
      await commit();
      await session.close();
    };
    const rollback = tx.rollback.bind(tx);
    tx.rollback = async (): Promise<void> => {
      await rollback();
      await session.close();
    };
    tx.debugId = Math.floor(Math.random() * 10000); // for debugging purposes
    return tx;
  }

  private async run(query: string, parameters?: any, tx?: Transaction, config?: any): Promise<Result> {
    if (tx) {
      return tx.run(query, parameters);
    }

    const session = this.session();

    let failed = false;
    let result;
    try {
      result = await session.run(query, parameters, config);
    } catch (e) {
      failed = true;
      result = e;
      logger.error(e);
      throw e;
    } finally {
      await session.close();
    }

    if (failed) {
      throw result;
    }

    return result;
  }

  public acquireExclusiveLock(tx: Transaction): Promise<Result> {
    return this.run(`MATCH (x:${Repository.VIRTUAL_NODE}) SET x.flag = 1`, {}, tx);
  }

  public async addCall(
    caller: string | undefined,
    callee: string,
    metrics: ComponentCallMetrics,
    tx?: Transaction
  ): Promise<Result> {
    logger.debug(`Adding call ${caller}->${callee} ${JSON.stringify(metrics)} ${tx ? tx.debugId : "no-tx"}`);
    const emptyMetrics: ComponentCallMetrics = {
      // TODO update metrics
      duration: 0,
      errored: false,
      timestamp: 0,
    };
    if (!caller) {
      return this.run(
        `
          MERGE (callee:Component {id: $callee})
            ON CREATE SET
              callee = $metrics,
              callee.id = $callee,
              callee.count = 1,
              callee.status = "${STATUS.NORMAL}",
              callee:${STATUS.NORMAL}
        `, // TODO update metrics
        { callee, metrics },
        tx
      );
    }
    logger.debug(`
    MERGE (caller:Component {id: $caller})
      ON CREATE SET
        caller = $emptyMetrics,
        caller.id = $caller,
        caller.count = 1,
        caller.status = "${STATUS.NORMAL}",
        caller:${STATUS.NORMAL}
    MERGE (callee:Component {id: $callee})
      ON CREATE SET
        callee = $metrics,
        callee.id = $callee,
        callee.count = 1,
        callee.status = "${STATUS.NORMAL}",
        callee:${STATUS.NORMAL}
    MERGE (caller)-[r:CALLS]->(callee)
      ON CREATE SET
        r.callee_is = ${statusUtils.isAnomalousCypher},
        r.callee_status = callee.status
  `);
    return this.run(
      `
        MERGE (caller:Component {id: $caller})
          ON CREATE SET
            caller = $emptyMetrics,
            caller.id = $caller,
            caller.count = 1,
            caller.status = "${STATUS.NORMAL}",
            caller:${STATUS.NORMAL}
        MERGE (callee:Component {id: $callee})
          ON CREATE SET
            callee = $metrics,
            callee.id = $callee,
            callee.count = 1,
            callee.status = "${STATUS.NORMAL}",
            callee:${STATUS.NORMAL}
        MERGE (caller)-[r:CALLS]->(callee)
          ON CREATE SET
            r.callee_is = ${statusUtils.isAnomalousCypher},
            r.callee_status = callee.status
      `,
      { caller, callee, metrics, emptyMetrics },
      tx
    );
  }

  /**
   * @param componentId - Id of the component to be searched
   *
   * getComponent s
   */
  public async getComponent(id: string, tx?: Transaction): Promise<Component> {
    // TODO this is not fully a Component
    const result = await this.run(
      `MATCH (component:Component {id: $id})
      OPTIONAL MATCH (component)-[]->(v:Component) 
      RETURN component, v`,
      { id },
      tx
    );
    // TODO cast result to "Component"?
    // const component = new Component(result)
    logger.warn("COMPONENT " + inspect(result.records[0].get("component")));
    const node: neo4j.Node = result.records[0].get("component");
    const dependencies = result.records.map((x: neo4j.Record) => x.get("v"));

    const props: any = node.properties; // TODO this is a negrada
    return new Component(props.id, new Set(dependencies), new Set(), props.status);
    // return new Component("hardcoded-test-name");
  }

  public async setStatus(id: string, status: STATUS, tx?: Transaction): Promise<Result> {
    if (!STATUS[status]) {
      logger.warn(`Trying to set invalid status (id: ${id}, status: ${status}, tx: ${tx ? tx.debugId : "no-tx"})`);
      throw Error("InvalidStatus");
    }
    logger.debug(`Setting status ${id} ${status} (${tx ? `tx:${tx.debugId}` : "no-tx"})`);
    return this.run(
      `
        MATCH (x :Component {id: $id})
        REMOVE ${Object.values(STATUS)
          .map((s: STATUS) => `x:${s}`)
          .concat(["x:Abnormal"])
          .join(", ")}
        SET x:${status}, x.status = $status${statusUtils.isAnomalous(status) ? ", x:Abnormal" : ""}
        WITH x
        MATCH ()-[r:CALLS]->(x)
        SET r.callee_status = $status, r.callee_is = "${statusUtils.isAnomalous(status) ? "Abnormal" : STATUS.NORMAL}"
      `,
      { id, status },
      tx
    );
  }

  /**
   * @param from - Id of the component on the origin of the dependency
   * @param to - Id of the component on the end of the dependency
   *
   * hasComponent
   */
  public async hasDependency(from: string, to: string, tx?: Transaction): Promise<boolean> {
    // const result = await this.run('MATCH (from: $from)-[:CALLS]->(to: $to)')
    return false;
  }

  public async getAbnormalChain(initialId: string, tx?: Transaction): Promise<Result> {
    return this.run(
      `
        MATCH (caller:Component:Abnormal {id: $initialId})
        OPTIONAL MATCH (caller)-[* {callee_is: "Abnormal"}]->(resultNode :Component:Abnormal)
        WHERE resultNode <> caller
        RETURN DISTINCT caller, resultNode
      `,
      { initialId },
      tx
    );
  }

  public async getPerpetratorChain(id: string, tx?: Transaction): Promise<Result> {
    return this.run(
      `
      MATCH (y:Component:PERPETRATOR)-[]->(x :Component {id: $id})
      OPTIONAL MATCH (caller:Component:PERPETRATOR)-[* {callee_status:"PERPETRATOR"}]->(y)
      WITH collect(y)+collect(caller) as nodes
      UNWIND nodes as n
      RETURN n
      `,
      { id },
      tx
    );
  }

  public async getCallersWithStatus(id: string, status: STATUS, tx?: Transaction): Promise<Result> {
    return this.run(
      `
      
        MATCH (caller:Component:${status})-[]->(x :Component {id: $id})
        RETURN (caller)
      `,
      { id },
      tx
    );
  }

  public async getDependenciesBetween(
    ids: string[],
    tx?: Transaction
  ): Promise<{ callerId: string; calleeId: string }[]> {
    const result = await this.run(
      `
      MATCH p = (caller :Component)-[]->(callee :Component)
      WHERE caller.id IN $ids AND callee.id IN $ids
      RETURN DISTINCT caller.id, callee.id
    `,
      { ids },
      tx
    );
    return result.records.map((r: Record) => ({
      callerId: r.get("caller.id"),
      calleeId: r.get("callee.id"),
    }));
  }

  public async getFullGraph(tx?: Transaction): Promise<Result> {
    return this.run(`MATCH (resultNode :Component) RETURN DISTINCT resultNode`, {}, tx);
  }

  public async clear(): Promise<void> {
    logger.warn("Clearing the entire graph (delete everything!");
    await this.run(`MATCH (x:Component) DETACH DELETE x`);
    await this.initialize();
    return;
  }
}
