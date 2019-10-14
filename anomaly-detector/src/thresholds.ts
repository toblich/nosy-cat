import { ServiceThresholds } from "./types";

const thresholds: ServiceThresholds = {
  test: {
    errorRate: 0.5,
    meanResponseTimeMs: 0.5,
    throughput: 0.5
  },
  test2: {
    errorRate: 0.5,
    meanResponseTimeMs: 0.5,
    throughput: 0.5
  }
};

export default thresholds;
