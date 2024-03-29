import { ComponentStatus, ComponentStatus as STATUS, logger, status as statusUtils } from "helpers";
import * as neo4j from "neo4j-driver";
import { inspect } from "util";

type Result = neo4j.QueryResult;
export type Record = neo4j.Record;
export type Transaction = neo4j.Transaction & { debugId?: number };

export interface Component {
  id: string;
  dependencies: Set<string>;
  status: ComponentStatus;
  transitionCounter: number;
}

interface NodeProperties {
  id: string;
  status: ComponentStatus;
  transition_counter: number;
}

// Make all nodes have the label Component
// Then, make them all have another label (or property?) with the status
// All of them should have a property "id: string"
// Then, have an index on Component(id)
// and a constraint on uniqueness of Component(id)

// All relations should have the same relation type - CALLS

export default class Repository {
  private driver = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic("neo4j", "bitnami"), {
    disableLosslessIntegers: true,
  });
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
    await this.run(
      `MERGE (x:${Repository.VIRTUAL_NODE}) ON CREATE SET x.id = "${Repository.VIRTUAL_NODE}", x.flag = 0`
    );
  }

  private session(...args: any): neo4j.Session {
    return this.driver.session(...args);
  }

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
      if ((e as neo4j.Neo4jError).code !== "Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists") {
        logger.error(e);
      }
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
    tx?: Transaction,
    isServiceReady: boolean = false
  ): Promise<void> {
    logger.debug(`Adding call ${caller}->${callee} ${tx ? tx.debugId : "no-tx"}`);
    const newServiceStatus = isServiceReady ? STATUS.NORMAL : STATUS.INITIALIZING;

    if (!caller) {
      await this.run(
        `
          MERGE (callee:Component {id: $callee})
            ON CREATE SET
              callee.id = $callee,
              callee.transition_counter = 0,
              callee.status = "${newServiceStatus}",
              callee:${newServiceStatus}
        `,
        { callee },
        tx
      );
      return;
    }

    await this.run(
      `
        MERGE (caller:Component {id: $caller})
          ON CREATE SET
            caller.id = $caller,
            caller.transition_counter = 0,
            caller.status = "${newServiceStatus}",
            caller:${newServiceStatus}
        MERGE (callee:Component {id: $callee})
          ON CREATE SET
            callee.id = $callee,
            callee.transition_counter = 0,
            callee.status = "${newServiceStatus}",
            callee:${newServiceStatus}
        MERGE (caller)-[r:CALLS]->(callee)
          ON CREATE SET
            r.callee_is = ${statusUtils.isAnomalousCypher("callee.status")},
            r.callee_status = callee.status
      `,
      { caller, callee },
      tx
    );
  }

  /**
   * @param componentId - Id of the component to be searched
   *
   * getComponent s
   */
  public async getComponent(id: string, tx?: Transaction): Promise<Component> {
    const result = await this.run(
      `MATCH (component:Component {id: $id})
      OPTIONAL MATCH (component)-[]->(v:Component)
      RETURN component, v`,
      { id },
      tx
    );

    logger.warn("COMPONENT " + inspect(result.records[0].get("component")));
    const node: neo4j.Node = result.records[0].get("component");
    const dependencies = result.records.map((x: neo4j.Record) => x.get("v")?.properties.id).filter((s: string) => s);

    const props = node.properties as NodeProperties;

    return {
      id: props.id,
      dependencies: new Set(dependencies),
      status: props.status,
      transitionCounter: props.transition_counter,
    };
  }

  public async setStatus(
    id: string,
    status: STATUS,
    tx?: Transaction,
    opts: { resetCounter?: boolean } = { resetCounter: false }
  ): Promise<void> {
    if (!STATUS[status]) {
      logger.warn(`Trying to set invalid status (id: ${id}, status: ${status}, tx: ${tx ? tx.debugId : "no-tx"})`);
      throw Error("InvalidStatus");
    }
    logger.debug(`Setting status ${id} ${status} (${tx ? `tx:${tx.debugId}` : "no-tx"})`);
    await this.run(
      `
        MATCH (x :Component {id: $id})
        REMOVE ${Object.values(STATUS)
          .map((s: STATUS) => `x:${s}`)
          .concat(["x:Abnormal"])
          .join(", ")}
        SET x:${status}, x.status = $status${statusUtils.isAnomalous(status) ? ", x:Abnormal" : ""}${
        opts.resetCounter ? ", x.transition_counter = 0" : ""
      }
        WITH x
        MATCH ()-[r:CALLS]->(x)
        SET r.callee_status = $status, r.callee_is = ${statusUtils.isAnomalousCypher("x.status")}
      `,
      { id, status },
      tx
    );
  }

  public async setTransitionCounter(id: string, value: number, tx?: Transaction): Promise<void> {
    await this.run(
      `
        MATCH (x :Component {id: $id})
        SET x.transition_counter = $value
      `,
      { id, value },
      tx
    );
  }

  public async getAbnormalChain(initialId: string, tx?: Transaction): Promise<NodeProperties[]> {
    const result = await this.run(
      `
        MATCH (caller:Component:Abnormal {id: $initialId})
        OPTIONAL MATCH (caller)-[* {callee_is: "Abnormal"}]->(resultNode :Component:Abnormal)
        WHERE resultNode <> caller
        RETURN DISTINCT caller, resultNode
      `,
      { initialId },
      tx
    );

    if (result.records.length === 0) {
      // Caller is not abnormal, so there is no causal chain whatsoever
      return [];
    }

    const caller = result.records[0].get("caller").properties as NodeProperties;
    const tail = result.records
      .map((r: Record) => r.get("resultNode")?.properties)
      .filter((n: NodeProperties | null) => n);

    return [caller, ...tail];
  }

  public async getPerpetratorIDsChain(id: string, tx?: Transaction): Promise<string[]> {
    const result = await this.run(
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

    return result.records.map((r: Record) => r.get("n")?.properties.id);
  }

  public async getCallerIDsWithStatus(id: string, status: STATUS, tx?: Transaction): Promise<string[]> {
    const result = await this.run(
      `
        MATCH (caller:Component:${status})-[]->(x :Component {id: $id})
        RETURN (caller)
      `,
      { id },
      tx
    );

    return result.records.map((r: Record) => r.get("caller")?.properties.id);
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

  public async getAllIDs(tx?: Transaction): Promise<string[]> {
    const result = await this.run(`MATCH (resultNode :Component) RETURN DISTINCT resultNode`, {}, tx);
    return result.records.map((r: any) => r.get("resultNode")?.properties.id);
  }

  public async clear(): Promise<void> {
    logger.warn("Clearing the entire graph (delete everything!");
    await this.run(`MATCH (x:Component) DETACH DELETE x`);
    await this.initialize();
    return;
  }
}
