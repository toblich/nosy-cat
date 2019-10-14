import { Dictionary, ComponentMetrics } from "helpers";

export enum MetricTypes {
  errorRate = "Error Rate",
  throughput = "Throughput",
  meanResponseTimeMs = "Mean Response Time"
}

export type ServiceThresholds = Dictionary<ComponentMetrics>;
