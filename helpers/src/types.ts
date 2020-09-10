import * as Kafka from "kafkajs";
import { Request } from "express";

export enum ComponentStatus {
  NORMAL = "NORMAL",
  SUSPICIOUS = "SUSPICIOUS",
  CONFIRMED = "CONFIRMED",
  VICTIM = "VICTIM",
  PERPETRATOR = "PERPETRATOR",
  HEALING = "HEALING"
}

export enum ZipkinSpanKind {
  SERVER = "SERVER",
  CLIENT = "CLIENT"
}

export enum MetricTypes {
  errorRate = "Error Rate",
  throughput = "Throughput",
  meanResponseTimeMs = "Mean Response Time"
}

export interface ZipkinSpan {
  traceId: string;
  parentId: string;
  id: string;
  name: string;
  kind: ZipkinSpanKind;
  timestamp: number;
  duration: number;
  tags: Dictionary<any>;
  localEndpoint: { serviceName: string };
  remoteEndpoint: { serviceName: string; port: string };
}

export type ZipkinMessageValue = ZipkinSpan[] | ZipkinSpan;

export interface BaseMessage<T> {
  offset: number;
  value: T;
}

export interface IngressMessage extends BaseMessage<ZipkinMessageValue> {}

export interface DependencyDetectionMessage extends BaseMessage<ComponentCall[]> {}

export interface ComponentMetrics {
  throughput: number;
  meanResponseTimeMs: number;
  errorRate: number; // Float in range [0, 1]
}

export interface ComponentCallMetrics {
  duration: number;
  errored: boolean;
  timestamp: number;
}

export interface HistoricMetric {
  name: string;
  latest: number;
  historicAvg: number;
  historicStdDev: number;
}

export interface ComponentHistoricMetrics {
  component: string;
  metrics: HistoricMetric[];
}

export interface ComponentCall {
  caller?: string;
  callee: string;
  metrics?: ComponentCallMetrics;
}

export interface ComponentPlainObject {
  id: string;
  dependencies: string[];
  consumers: string[];
  status: ComponentStatus;
}

export interface Component extends ComponentPlainObject {
  metrics: ComponentMetrics;
}

export interface UIGraph {
  nodes: UINode[];
  edges: UIEdge[];
}

export interface UIEdge {
  from: string;
  to: string;
  metadata: any;
}

export interface UINode {
  id: any;
  label: string;
  title: string;
  metadata: any;
}

export interface Dictionary<T> {
  [x: string]: T;
}

interface ExpressReq<Body> extends Request {
  body: Body;
}

export type UpdateComponentStatusReq = ExpressReq<{
  component: string;
  status: ComponentStatus;
}>;

export interface Alert {
  serviceName: string;
  type: MetricTypes;
  expected: number;
  value: number;
  message: string;
}

export type ComponentIdReq = ExpressReq<{ component: string }>;

export type AddComponentsReq = ExpressReq<ComponentCall[]>;

export type EmptyReq = ExpressReq<{}>;

export type Producer = Kafka.Producer;
export type Consumer = Kafka.Consumer;
