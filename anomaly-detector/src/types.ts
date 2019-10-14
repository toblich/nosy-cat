import { Dictionary } from "helpers";

export enum MetricTypes {
  errorRate = "Error Rate",
  throughput = "Throughput",
  meanResponseTimeMs = "Mean Response Time"
}

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
