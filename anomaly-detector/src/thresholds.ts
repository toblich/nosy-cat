import { ServiceThresholds } from "./types";

const thresholds: ServiceThresholds = {
  test: {
    errorRate: { minimum: 0, maximum: 0.5 },
    meanResponseTimeMs: { minimum: 0, maximum: 1200 },
    throughput: {
      minimum: 0.8,
      maximum: 1.2
    }
  },
  test2: {
    errorRate: { minimum: 0, maximum: 0.5 },
    meanResponseTimeMs: { minimum: 100, maximum: 700 },
    throughput: {
      minimum: 0.3,
      maximum: 1.1
    }
  }
};

export default thresholds;
