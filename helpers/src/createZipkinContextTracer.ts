import { Tracer, ExplicitContext, ConsoleRecorder } from "zipkin";

export function createZipkinContextTracer(localServiceName: string) {
  const ctxImpl = new ExplicitContext();
  const recorder = new ConsoleRecorder(() => undefined);
  const tracer = new Tracer({ ctxImpl, recorder, localServiceName });

  return { ctx: ctxImpl, tracer };
}
