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

export type ZipkinMessageBody = ZipkinSpan[] | ZipkinSpan;

export interface Message {
  value: ZipkinMessageBody;
  offset: number;
}

export interface ComponentCall {
  caller?: string;
  callee: string;
}

export interface GraphServiceRequestBody {
  componentCalls: ComponentCall[];
}
