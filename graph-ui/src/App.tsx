import React from "react";
import "./App.css";
import Graph from "react-graph-vis";
import { Options } from "vis";
import { connect } from "socket.io-client";

const graph = {
  nodes: [],
  edges: []
};

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
    const { nodes, edges } = event;
    console.log(nodes, edges);
  }
};

// const prettify = (graph) => {}

class App extends React.PureComponent<any, any> {
  private socket: SocketIOClient.Socket;

  constructor(props: any) {
    super(props);
    this.state = {
      graph
    };

    this.socket = connect("http://localhost:51083");
  }

  public componentDidMount(): void {
    this.socket.on("graph", (newGraph: any): void => {
      // console.log("graph sent", newGraph);
      this.setState({
        graph: newGraph
      });
    });

    setInterval(() => {
      this.socket.send("joni");
    }, 10000);
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
