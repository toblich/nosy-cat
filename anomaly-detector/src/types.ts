import { Dictionary } from "helpers";

export interface Range {
  minimum: number;
  maximum: number;
}

export interface Metrics {
  throughput: Range;
  meanResponseTimeMs: Range;
  errorRate: Range;
}

export type ServiceThresholds = Dictionary<Metrics>;
