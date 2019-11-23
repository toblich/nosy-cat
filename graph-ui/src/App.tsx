import React from "react";
import "./App.css";
import Graph from "react-graph-vis";
import { Options } from "vis";
import { connect } from "socket.io-client";

const graph = {
  nodes: [],
  edges: []
};

enum ComponentStatus {
  NORMAL = "NORMAL",
  SUSPICIOUS = "SUSPICIOUS",
  CONFIRMED = "CONFIRMED",
  VICTIM = "VICTIM",
  PERPETRATOR = "PERPETRATOR"
}

const options: Options = {
  layout: {
    hierarchical: true
  },
  edges: {
    color: "#000000"
  },
  height: "100%",
  autoResize: false,
  physics: {
    enabled: false
  },
  clickToUse: false,
  interaction: {
    dragNodes: false
  }
};

const events = {
  select: (event: any): void => {
    // const { nodes, edges } = event;
  }
};

const colorMap = {
  [ComponentStatus.NORMAL]: "#A9E5BB",
  [ComponentStatus.SUSPICIOUS]: "#FCF6B1",
  [ComponentStatus.PERPETRATOR]: "#F72C25",
  [ComponentStatus.VICTIM]: "#F7B32B",
  [ComponentStatus.CONFIRMED]: "#F7B32B"
};

const prettify = (newGraph: any): any => {
  return {
    ...newGraph,
    nodes: newGraph.nodes.map((node: any) => ({
      ...node,
      color: colorMap[node.metadata.status as ComponentStatus]
    }))
  };
};

class App extends React.PureComponent<any, any> {
  private socket: SocketIOClient.Socket;

  constructor(props: any) {
    super(props);
    this.state = {
      graph
    };

    this.socket = connect("http://localhost:4000");
  }

  public componentDidMount(): void {
    this.socket.on("graph", (newGraph: any): void => {
      this.setState({
        graph: prettify(newGraph)
      });
    });
  }

  public render(): JSX.Element {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Graph visualization</h1>
        </header>
        <Graph graph={this.state.graph} options={options} events={events} />
      </div>
    );
  }
}

export default App;
