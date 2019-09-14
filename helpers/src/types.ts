export enum ServiceStatus {
  NORMAL = "NORMAL",
  SUSPICIOUS = "SUSPICIOUS",
  CONFIRMED = "CONFIRMED",
  VICTIM = "VICTIM",
  PERPETRATOR = "PERPETRATOR"
}

export interface ZipkinSpan {
  traceId: string;
  parentId: string;
  id: string;
  name: string;
  kind: string;
  timestamp: number;
  duration: number;
  localEndpoint: { serviceName: string };
  remoteEndpoint: { serviceName: string; port: string };
}

export type ZipkinMessageValue = ZipkinSpan[] | ZipkinSpan;

export interface DependencyDetectionMessageValue {
  service: string;
  lastResponseDuration: number;
  timestamp: number;
}

export interface BaseMessage<T> {
  offset: number;
  value: T;
}

export interface IngressMessage extends BaseMessage<ZipkinMessageValue> {}

export interface DependencyDetectionMessage extends BaseMessage<DependencyDetectionMessageValue> {}

export interface ComponentCall {
  caller?: string;
  callee: string;
}

export interface GraphServiceRequestBody {
  componentCalls: ComponentCall[];
}

export interface Dictionary<T> {
  [x: string]: T;
}
