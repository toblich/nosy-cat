// @ts-nocheck
import graphService = require("./service");
import fs = require("fs");
import { util } from "prettier";
import { inspect } from "util";

const lines = fs.readFileSync("graphTopologies.txt", { encoding: "utf8", flag: "r" });

// tslint:disable-next-line:typedef
const linesToProcess = lines.split("\n").filter((line) => line.startsWith("!"));

const CALLS = "->";
const IS_CALLED = "<-";
const CYCLE = "<->";

// tslint:disable-next-line:typedef
async function processLine(line: string) {
  const testNumber = line.split(")")[0].trim().replace("!", "");
  const content = line.split(")")[1].trim();
  const positions = content.split(" ");

  const relations = {};

  for (let i = 0; i < positions.length - 2; i += 2) {
    const vertex = positions[i];
    const symbol = positions[i + 1];
    const nextVertex = positions[i + 2];

    if (symbol === ";") {
      continue;
    }

    const vertexKey = `${testNumber}-${vertex}`;
    const nextVertexKey = `${testNumber}-${nextVertex}`;

    if (relations[vertexKey] == null) {
      relations[vertexKey] = [];
    }

    if (relations[nextVertexKey] == null) {
      relations[nextVertexKey] = [];
    }

    if (symbol === CALLS) {
      relations[vertexKey].push(nextVertexKey);
    } else if (symbol === IS_CALLED) {
      relations[nextVertexKey].push(vertexKey);
    } else {
      relations[vertexKey].push(nextVertexKey);
      relations[nextVertexKey].push(vertexKey);
    }
  }

  await initialize(relations);
}

const defaultTestMetrics = Object.freeze({
  duration: 1,
  errored: true,
  timestamp: Date.now(),
});

// tslint:disable-next-line:typedef
async function initialize(graph: { [s: string]: unknown } | ArrayLike<unknown>) {
  await graphService.clear();
  // tslint:disable-next-line:typedef
  const componentCalls = Object.entries(graph).flatMap(([caller, callees]) => {
    return !callees || (callees as any).length === 0
      ? { callee: caller, metrics: defaultTestMetrics }
      : (callees as any).map((callee: any) => ({ caller, callee, metrics: defaultTestMetrics }));
  });
  try {
    // if (debug) {
    //   console.log("ComponentCalls", JSON.stringify(componentCalls, null, 4));
    // }
    await graphService.add([...componentCalls]);
  } catch (error) {
    throw Error(`There was an error while adding the component calls, ${error.stack}`);
  }
}

// tslint:disable-next-line:no-console typedef
Promise.all(linesToProcess.map(processLine)).then((resultingLines) => console.log("DONE"));
