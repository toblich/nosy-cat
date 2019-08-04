import { Tracer, ExplicitContext, ConsoleRecorder } from "zipkin";

export default function contextTracerFactory(localServiceName: string) {
  const ctxImpl = new ExplicitContext();
  const recorder = new ConsoleRecorder();
  const tracer = new Tracer({ ctxImpl, recorder, localServiceName });

  return { ctx: ctxImpl, tracer };
}
