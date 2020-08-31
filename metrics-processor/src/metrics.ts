import { redis, logger, ComponentMetrics, HistoricMetric } from "helpers";
import * as Redlock from "redlock";
import { map, mapValues } from "lodash";

import { EWMA, EWMAStdDeviation } from "./ewma";

const MIN_IN_MS = 60000; // 1 min in milliseconds
const DELIM = ":";
const TTL_BUFFER = 60 * 10; // 10 mins
const TTL_LOCKS = 1000; // in ms, as this is for redlock and not plain redis
const TTL_EWMAS = 60 * 60 * 24; // hold learnt metrics history for up to a day

const host = process.env.REDIS_HOST || "localhost";
const bufferRedisClient = redis.createClient({ host, db: 0 });
const ewmaRedisClient = redis.createClient({ host, db: 1 });

// using special client for locks as it only really the host is relevant, and it seems
// better to use a separate DB for locks so that each DB has a consistent type (and as locks simultaneously lock
// resources in more than one DB)
const locksRedisClient = redis.createClient({ host, db: 2 });
const redlock = new Redlock([locksRedisClient], {});

const bufferFields = {
  THROUGHPUT: "throughput",
  ERRORS: "errors",
  TOTAL_MS: "total_ms",
};

const metricFields = {
  THROUGHPUT: "throughput",
  ERROR_RATE: "errorRate",
  RESPONSE_TIME: "meanResponseTimeMs",
};

interface RequestMetadata {
  component: string;
  errored: boolean;
  timestamp: number;
  duration: number;
}

interface MetricsBuffer {
  // Redis returns everything as strings...
  throughput: string;
  errors: string;
  total_ms: string;
}

type ComponentMetricStrings = {
  // Redis returns everything as strings...
  [x in keyof ComponentMetrics]: string;
};

export async function processRequest(metadata: RequestMetadata): Promise<HistoricMetric[]> {
  const { component, errored, timestamp, duration } = metadata;

  const minuteTs = minuteFloor(timestamp / 1000); // `/ 1000` because the epoch generated by zipkin is in microseconds
  const key = buildBufferKey(component, minuteTs);

  logger.debug(`${component}: Processing request for key "${key}"...`);

  await updateBuffer(key, duration, errored);
  logger.debug(`${component}: buffer updated for key "${key}"`);

  const pattern = join(component, "*");
  logger.debug(`${component}: Checking buffers with pattern "${pattern}"...`);
  const componentBufferKeys: number[] = (await keys(bufferRedisClient, pattern))
    .map(prefixRemover(component))
    .map(deserializeTs);
  logger.debug(`${component}: Existing buffers: ${JSON.stringify(componentBufferKeys)}`);

  const previousBuffersKeys = componentBufferKeys
    .filter((ts: number) => ts < minuteTs) // filter previous keys
    .sort((a: number, b: number) => a - b); // and sort temporally ascending

  logger.debug(`${component}: Checking previous buffers ${JSON.stringify(previousBuffersKeys)}...`);
  const historicMetrics = [];
  for (const ts of previousBuffersKeys) {
    // cannot be done concurrently as order must be guaranteed and an execution needs
    // to wait for previous ones due to the side-effect of updating the EWMA
    const historicMetric = await updateEWMAs(component, buildBufferKey(component, ts));
    historicMetrics.push(...historicMetric);
  }

  logger.debug(`${component}: ${JSON.stringify(historicMetrics)}`);

  return historicMetrics;
}

function prefixRemover(prefix: string): (key: string) => string {
  const regex = new RegExp(`^${prefix}:`);
  return (key: string): string => key.replace(regex, "");
}

async function updateBuffer(key: string, duration: number, errored: boolean): Promise<void> {
  const multi = bufferRedisClient.multi();
  multi.hincrby(key, bufferFields.THROUGHPUT, 1);
  multi.hincrby(key, bufferFields.TOTAL_MS, duration);
  multi.hincrby(key, bufferFields.ERRORS, errored ? 1 : 0);
  multi.expire(key, TTL_BUFFER); // Set expiration to keep some (short) history
  await exec(multi);
}

type Callback = (value: number) => void;

async function updateEWMAs(component: string, bufferKey: string): Promise<HistoricMetric[]> {
  logger.debug(`${component}: Locking...`);
  const lock = await redlock.lock(component, TTL_LOCKS);
  logger.debug(`${component}: Locked`);
  const buffer = await hgetall<MetricsBuffer | null>(bufferRedisClient, bufferKey);
  if (!buffer) {
    logger.debug(`${component}: Buffer empty (${buffer}). Unlocking...`);
    // the buffer was empty, so it was already processed and there is nothing more to do!
    await lock.unlock();
    return [];
  }

  logger.debug(`${component}: Aggregating buffer ${JSON.stringify(buffer)}...`);
  const metrics = aggregateBuffer(buffer);
  const [ewmaKey, ewmaSquaresKey] = [buildEWMAKey(component), buildEWMASquaresKey(component)];
  const [ewmas, ewmaSquares] = (
    await Promise.all(
      [ewmaKey, ewmaSquaresKey].map((key: string) => hgetall<ComponentMetricStrings>(ewmaRedisClient, key))
    )
  ).map(toComponentMetric);

  const multi = ewmaRedisClient.multi();
  for (const field of Object.values(metricFields)) {
    const currentMeasure = metrics[field];
    const hset = (key: string): Callback => (value: number): void => {
      multi.hset(key, field, "" + value);
    };
    updateEWMA(currentMeasure, ewmas, field, hset(ewmaKey));
    updateEWMA(currentMeasure * currentMeasure, ewmaSquares, field, hset(ewmaSquaresKey));
  }
  multi.expire(ewmaKey, TTL_EWMAS);
  multi.expire(ewmaSquaresKey, TTL_EWMAS);

  try {
    logger.debug(`${component}: Executing multi...`);
    await exec(multi);
    logger.debug(`${component}: Deleting processed buffer "${bufferKey}"...`);
    del(bufferRedisClient, bufferKey)
      .then(() => logger.debug(`${component}: Deleted buffer "${bufferKey}"`))
      .catch(logger.error); // fire-n-forget (don't await)
    logger.debug(`${component}: Updated. Unlocking!`);
    await lock.unlock();
  } catch (error) {
    logger.debug(`${component}: ERROR ${error}. Unlocking!`);
    await lock.unlock();
    throw error;
  }

  return map(metricFields, (field: string) => ({
    name: field,
    latest: +metrics[field],
    historicAvg: +ewmas[field],
    historicStdDev: EWMAStdDeviation(+ewmaSquares[field], +ewmas[field]),
  }));
}

function updateEWMA(currentMeasure: number, ewmas: ComponentMetrics, field: string, callback: Callback): void {
  // initialize at current measure (when there's no previous EWMA)
  const currentEWMA = ewmas ? +ewmas[field] : currentMeasure;
  callback(EWMA(currentEWMA, currentMeasure));
}

function aggregateBuffer(metrics: MetricsBuffer): ComponentMetrics {
  return {
    throughput: +metrics[bufferFields.THROUGHPUT],
    meanResponseTimeMs: metrics[bufferFields.TOTAL_MS] / metrics[bufferFields.THROUGHPUT],
    errorRate: metrics[bufferFields.ERRORS] / metrics[bufferFields.THROUGHPUT],
  };
}

// --- Helper functions ---

function deserializeTs(serialized: string): number {
  return new Date(serialized).getTime(); // TODO change if serialization changes
}

function serializeTs(ts: number): string {
  return new Date(ts).toISOString(); // TODO change to use epoch as serialization mechanism for better perf overall
}

function minuteFloor(timestamp: number): number {
  return Math.floor(timestamp / MIN_IN_MS) * MIN_IN_MS; // timestamp truncated at the minute
}

function buildBufferKey(component: string, ts: number): string {
  return join(component, serializeTs(ts));
}

function join(...args: string[]): string {
  return args.join(DELIM);
}

function buildEWMAKey(component: string): string {
  return join(component, "ewma");
}

function buildEWMASquaresKey(component: string): string {
  return join(component, "ewma_squares");
}

function toComponentMetric(componentMetricString: ComponentMetricStrings): ComponentMetrics {
  return mapValues(componentMetricString, (str: string) => +str);
}

// --- Redis async functions ---

async function hgetall<T>(client: redis.RedisClient, key: string): Promise<T> {
  return (client as any).hgetallAsync(key);
}

async function keys(client: redis.RedisClient, pattern: string): Promise<string[]> {
  return (client as any).keysAsync(pattern);
}

async function del(client: redis.RedisClient, key: string): Promise<void> {
  return (client as any).delAsync(key);
}

async function exec<T = void>(multi: redis.Multi): Promise<T> {
  return (multi as any).execAsync();
}
