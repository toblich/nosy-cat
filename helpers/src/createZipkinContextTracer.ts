import { Tracer, ExplicitContext, ConsoleRecorder } from "zipkin";

export function createZipkinContextTracer(localServiceName: string): { ctx: ExplicitContext; tracer: Tracer } {
  const ctxImpl = new ExplicitContext();
  const recorder = new ConsoleRecorder((): void => undefined);
  const tracer = new Tracer({ ctxImpl, recorder, localServiceName });

  return { ctx: ctxImpl, tracer };
}
