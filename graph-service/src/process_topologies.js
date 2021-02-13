const fs = require("fs");
const { util } = require("prettier");
const { inspect } = require("util");

const lines = fs.readFileSync("graphTopologies.txt", { encoding: "utf8", flag: "r" });

const linesToProcess = lines.split("\n").filter((line) => line.startsWith("!"));

const CALLS = "->";
const IS_CALLED = "<-";
const CYCLE = "<->";

function processLine(line) {
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

  return relations;
}

fs.writeFileSync(
  "topologies_visualization.json",
  inspect(linesToProcess.map(processLine), false, 4).replace(/'/g, '"')
);
