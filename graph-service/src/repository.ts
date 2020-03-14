// tslint:disable: no-console

import { logger } from "helpers";
import * as neo4j from "neo4j-driver";
import { Component } from "./Graph";

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

    try {
      await this.addComponent("xapi");
      await this.addComponent("iam");
      await this.addComponent("2");
      await this.addComponent("3");
      await this.addComponent("4");
      await this.addDependency("xapi", "iam");
      await this.addDependency("xapi", "2");
      await this.addDependency("xapi", "3");
      await this.addDependency("xapi", "4");
      const result = await this.run(`Match (n) Return n`);
      console.log("------------------------------------------------");
      result.records.map((r: neo4j.Record) => console.log(JSON.stringify(r.get("n"), null, 4)));
      console.log(JSON.stringify(result, null, 4));
      await this.getComponent("xapi");
    } catch (e) {
      console.log(e);
    }
  }

  private session(...args: any): neo4j.Session {
    return this.driver.session(...args);
  }

  private async run(query: string, parameters?: any, config?: any): Promise<neo4j.QueryResult> {
    const session = this.session();
    const result = await session.run(query, parameters, config);
    await session.close();
    return result;
  }

  /**
   * Creates a new Component in the Database
   *
   * @param id - The id of the new component
   *
   * addComponent
   */
  public addComponent(id: string): Promise<neo4j.QueryResult> {
    return this.run(`MERGE (component:Component:Normal {id: $id}) RETURN component.id as id`, { id });
  }

  /**
   * Creates a dependency between two components in the Database
   *
   * @param from - Id of the component on the origin of the dependency
   * @param to - Id of the component on the end of the dependency
   */
  public async addDependency(from: string, to: string): Promise<neo4j.QueryResult> {
    const result = await this.run(
      `MATCH (from:Component {id: $from}),(to:Component {id: $to})
    MERGE (from)-[r:CALLS]->(to)
    RETURN from, type(r) as type, to`,
      { from, to }
    );
    return result;
  }

  /**
   * @param componentId - Id of the component to be searched
   *
   * getComponent s
   */
  public async getComponent(id: string): Promise<Component> {
    const result = await this.run("MATCH (component:Component {id: $id})-[]->(v:Component) RETURN component, v", {
      id
    });
    // console.log(JSON.stringify(result, null, 4));
    // TODO cast result to "Component"?
    // const component = new Component(result)
    const node: neo4j.Node = result.records[0].get("component");
    const dependencies = result.records.map((x: neo4j.Record) => x.get("v"));
    console.log("dependencies", dependencies);
    return new Component(node.id);
  }

  /**
   * @param from - Id of the component on the origin of the dependency
   * @param to - Id of the component on the end of the dependency
   *
   * hasComponent
   */
  public async hasDependency(from: string, to: string): Promise<boolean> {
    // const result = await this.run('MATCH (from: $from)-[:CALLS]->(to: $to)')
    return false;
  }
}
