// tslint:disable: no-console

import { logger, ComponentCallMetrics } from "helpers";
import * as neo4j from "neo4j-driver";
import { Component } from "./Graph";
import { Request } from "express";

export type Result = neo4j.QueryResult;
export type Transaction = neo4j.Transaction;

export default class Repository {
  private driver = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic("neo4j", "bitnami"));

  public constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.run("CREATE CONSTRAINT Component_id_unique on (x:Component) ASSERT x.id IS UNIQUE");
    } catch (error) {
      if ((error as neo4j.Neo4jError).code === "Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists") {
        logger.info("Constraint already exists!");
      } else {
        throw error;
      }
    }

    // try {
    //   await thi
    //   await this.addComponent("xapi");
    //   await this.addComponent("iam");
    //   await this.addComponent("2");
    //   await this.addComponent("3");
    //   await this.addComponent("4");
    //   await this.addDependency("xapi", "iam");
    //   await this.addDependency("xapi", "2");
    //   await this.addDependency("xapi", "3");
    //   await this.addDependency("xapi", "4");
    //   const result = await this.run(`Match (n) Return n`);
    //   console.log("------------------------------------------------");
    //   result.records.map((r: neo4j.Record) => console.log(JSON.stringify(r.get("n"), null, 4)));
    //   console.log(JSON.stringify(result, null, 4));
    //   await this.getComponent("xapi");
    // } catch (e) {
    //   console.log(e);
    // }
  }

  private session(...args: any): neo4j.Session {
    return this.driver.session(...args);
  }

  public transaction(): Transaction {
    const session = this.session();
    const tx = session.beginTransaction();
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

  /**
   * Creates a new Component in the Database
   *
   * @param id - The id of the new component
   *
   * addComponent
   */
  public addComponent(id: string, tx?: Transaction): Promise<Result> {
    return this.run(`MERGE (component:Component:Normal {id: $id}) RETURN component.id as id`, { id }, tx);
  }

  /**
   * Creates a dependency between two components in the Database
   *
   * @param from - Id of the component on the origin of the dependency
   * @param to - Id of the component on the end of the dependency
   */
  public async addDependency(from: string, to: string, tx?: Transaction): Promise<Result> {
    const result = await this.run(
      `MATCH (from:Component {id: $from}),(to:Component {id: $to})
    MERGE (from)-[r:CALLS]->(to)
    RETURN from, type(r) as type, to`,
      { from, to },
      tx
    );
    return result;
  }

  public async addCall(
    caller: string | undefined,
    callee: string,
    metrics: ComponentCallMetrics,
    tx?: Transaction
  ): Promise<Result> {
    logger.debug(`Adding call with args (${caller}, ${callee}, ${metrics}, ${tx})`);
    const emptyMetrics: ComponentCallMetrics = {
      // TODO update metrics
      duration: 0,
      errored: false,
      timestamp: 0
    };
    if (!caller) {
      return this.run(
        `
          MERGE (callee:Component {id: $callee})
            ON CREATE SET callee = $metrics, callee.id = $callee, callee.count = 1
            ON MATCH SET callee.count = callee.count + 1
        `, // TODO update metrics
        { callee, metrics },
        tx
      );
    }
    return this.run(
      `
        MERGE (caller:Component {id: $caller})
          ON CREATE SET caller = $emptyMetrics, caller.id = $caller, caller.count = 1
        MERGE (callee:Component {id: $callee})
          ON CREATE SET callee = $metrics, callee.id = $callee, callee.count = 1
          ON MATCH SET callee.count = callee.count + 1
        MERGE (caller)-[:CALLS]->(callee)
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
    const result = await this.run(
      "MATCH (component:Component {id: $id})-[]->(v:Component) RETURN component, v",
      {
        id
      },
      tx
    );
    // console.log(JSON.stringify(result, null, 4));
    // TODO cast result to "Component"?
    // const component = new Component(result)
    const node: neo4j.Node = result.records[0].get("component");
    const dependencies = result.records.map((x: neo4j.Record) => x.get("v"));
    console.log("dependencies", dependencies);
    // return new Component(node.properties.id);
    return new Component("hardcoded-test-name");
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

  public async clear(): Promise<Result> {
    logger.debug("Clearing the entire graph (delete everything!");
    return this.run(`MATCH (x) DETACH DELETE x`);
  }
}
