import * as redis from "redis";
import { promisifyAll } from "bluebird";

promisifyAll(redis.RedisClient.prototype);
promisifyAll(redis.Multi.prototype);

export { redis };
