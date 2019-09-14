import { Dictionary } from "helpers";

interface ServiceMetrics {
  errorRate: number;
  throughput: number;
  responseTime: number;
}

export enum MetricTypes {
  errorRate = "Error Rate",
  throughput = "Throughput",
  responseTime = "Response Time"
}

export type ServiceThresholds = Dictionary<ServiceMetrics>;
