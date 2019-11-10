import * as Kafka from "kafkajs";
import { Request } from "express";

export enum ComponentStatus {
  NORMAL = "NORMAL",
  SUSPICIOUS = "SUSPICIOUS",
  CONFIRMED = "CONFIRMED",
  VICTIM = "VICTIM",
  PERPETRATOR = "PERPETRATOR"
}

export enum ZipkinSpanKind {
  SERVER = "SERVER",
  CLIENT = "CLIENT"
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

export interface ComponentCall {
  caller?: string;
  callee: string;
  metrics?: ComponentCallMetrics;
}

export interface ComponentPlainObject {
  id: string;
  dependencies: string[];
  status: ComponentStatus;
}

export interface Component extends ComponentPlainObject {
  metrics: ComponentMetrics;
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

export type ComponentIdReq = ExpressReq<{ component: string }>;

export type AddComponentsReq = ExpressReq<ComponentCall[]>;

export type EmptyReq = ExpressReq<{}>;

export type Producer = Kafka.Producer;
export type Consumer = Kafka.Consumer;
