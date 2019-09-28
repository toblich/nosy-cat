import { redis, logger } from "helpers";

const redisClient = redis.createClient();

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
  const key = await getKey(component, timestamp);

  logger.debug(`Processing request for key "${key}"`);

  const multi = redisClient.multi();
  multi.hincrby(key, fields.THROUGHPUT, 1);
  multi.hincrby(key, fields.TOTAL_MS, duration);
  if (errored) {
    multi.hincrby(key, "errors", 1);
  }
  multi.expire(key, 600); // Set expiration to 10 min to keep some (short) history
  return (multi as any).execAsync().then(() => logger.debug(`metrics set for key "${key}"`));
}

export interface Metrics {
  throughput: number;
  meanResponseTimeMs: number;
  errorRate: number;
}
export async function getCurrent(component: string): Promise<Metrics | undefined> {
  const key = await getKey(component, Date.now());

  const metrics = await (redisClient as any).hgetallAsync(key);
  logger.debug(`Got metrics key "${key}": ${JSON.stringify(metrics, null, 4)}`);
  if (!metrics) {
    return {
      throughput: 0,
      meanResponseTimeMs: 0,
      errorRate: 0
    } as Metrics;
  }

  return {
    throughput: metrics[fields.THROUGHPUT],
    meanResponseTimeMs: metrics[fields.TOTAL_MS] / metrics[fields.THROUGHPUT],
    errorRate: metrics[fields.ERRORS] / fields[fields.THROUGHPUT]
  } as Metrics;
}

// --- Helper functions ---

const separator = ":";

async function getKey(component: string, timestamp: number): Promise<string> {
  const date = new Date(timestamp);
  logger.debug(`Timestamp: ${timestamp}. Date: ${date}. Minutes: ${date.getMinutes()}`);
  return `${component}${separator}${date.getMinutes()}`;
}
