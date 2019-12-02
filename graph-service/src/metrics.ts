import { redis, logger, ComponentMetrics } from "helpers";

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || "localhost"
});

const fields = {
  THROUGHPUT: "throughput",
  ERRORS: "errors",
  TOTAL_MS: "total_ms"
};

interface RequestMetadata {
  component: string;
  errored: boolean;
  timestamp: number;
  duration: number;
}
export async function processRequest({ component, errored, timestamp, duration }: RequestMetadata): Promise<void> {
  // This `/ 1000` is because the epoch generated by zipkin is in microseconds
  const key = await getKey(component, timestamp / 1000);

  logger.debug(`Processing request for key "${key}"`);

  const multi = redisClient.multi();
  multi.hincrby(key, fields.THROUGHPUT, 1);
  multi.hincrby(key, fields.TOTAL_MS, duration);
  if (errored) {
    multi.hincrby(key, "errors", 1);
  }
  multi.expire(key, 600); // Set expiration to 10 min to keep some (short) history

  await (multi as any).execAsync();
  logger.debug(`metrics set for key "${key}"`);
}

export async function getCurrent(component: string): Promise<ComponentMetrics> {
  const key = await getKey(component, Date.now());

  const metrics = await (redisClient as any).hgetallAsync(key);
  logger.debug(`Got metrics key "${key}": ${JSON.stringify(metrics, null, 4)}`);
  if (!metrics) {
    return {
      throughput: 0,
      meanResponseTimeMs: 0,
      errorRate: 0
    };
  }

  return {
    throughput: metrics[fields.THROUGHPUT],
    meanResponseTimeMs: metrics[fields.TOTAL_MS] / metrics[fields.THROUGHPUT],
    errorRate: metrics[fields.ERRORS] / metrics[fields.THROUGHPUT]
  };
}

// --- Helper functions ---

async function getKey(component: string, timestamp: number): Promise<string> {
  const date = new Date(timestamp);
  const key = `${component}:${date.getMinutes()}`;
  logger.debug(`generated key: ${key}`);
  return key;
}
