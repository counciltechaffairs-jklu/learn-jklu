import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

/**
 * 2-Tier High-Concurrency Cache (L1 In-Memory LRU + Optional L2 Redis)
 * with Singleflight Stampede Protection.
 */
const l1Cache = new LRUCache({
  max: 1500,
  ttl: 60 * 1000,
  allowStale: false,
});

const inFlightRequests = new Map();

let redisClient = null;
let redisConnected = false;
let cacheHits = 0;
let l2RedisHits = 0;
let cacheMisses = 0;
let stampedesPrevented = 0;

const REDIS_URL = String(process.env.REDIS_URL || '').trim();
const MAX_REDIS_VALUE_BYTES = 120 * 1024; // 120KB max per key
const CACHE_KEY_PREFIX = 'jklu:cache:';

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redisClient.on('connect', async () => {
      redisConnected = true;
      console.log('⚡ [Cache] Connected to Redis L2 Cache');
      try {
        await redisClient.config('SET', 'maxmemory-policy', 'allkeys-lru');
      } catch {
        // Managed Redis instances may restrict CONFIG SET; safe to ignore
      }
    });

    redisClient.on('error', (err) => {
      redisConnected = false;
      console.warn('⚠️ [Cache] Redis L2 warning (falling back to L1):', err.message);
    });
  } catch (err) {
    console.warn('⚠️ [Cache] Failed to initialize Redis client:', err.message);
  }
}

async function scanAndDeleteRedisPattern(pattern) {
  if (!redisClient || !redisConnected) return;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    if (Array.isArray(keys) && keys.length > 0) {
      await redisClient.del(...keys);
    }
  } while (cursor !== '0');
}

export async function flushRedisCache() {
  l1Cache.clear();
  if (redisClient && redisConnected) {
    try {
      await scanAndDeleteRedisPattern(`${CACHE_KEY_PREFIX}*`);
    } catch {}
  }
}

export async function closeCache() {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      try {
        redisClient.disconnect();
      } catch {}
    }
    redisClient = null;
    redisConnected = false;
  }
}

export async function getOrSetCache(key, ttlMs, fetcher) {
  // 1. Check L1 In-Memory Cache (~0.02ms)
  const cachedL1 = l1Cache.get(key);
  if (cachedL1 !== undefined) {
    cacheHits++;
    return cachedL1;
  }

  // 2. Singleflight Stampede Protection
  const existingPromise = inFlightRequests.get(key);
  if (existingPromise) {
    stampedesPrevented++;
    return existingPromise;
  }

  const promise = (async () => {
    try {
      // 3. Check L2 Redis Cache if connected
      if (redisClient && redisConnected) {
        try {
          const rawL2 = await redisClient.get(`${CACHE_KEY_PREFIX}${key}`);
          if (rawL2) {
            const parsed = JSON.parse(rawL2);
            l1Cache.set(key, parsed, { ttl: ttlMs });
            cacheHits++;
            l2RedisHits++;
            return parsed;
          }
        } catch {}
      }

      // 4. Cache Miss -> Fetch from DB
      cacheMisses++;
      const freshData = await fetcher();

      // Skip caching null/undefined (e.g. 404 misses) to prevent cache pollution & negative-cache poisoning
      if (freshData === undefined || freshData === null) {
        return freshData;
      }

      l1Cache.set(key, freshData, { ttl: ttlMs });

      // Store in L2 Redis asynchronously if compact (< 120KB)
      if (redisClient && redisConnected) {
        try {
          const serialized = JSON.stringify(freshData);
          if (Buffer.byteLength(serialized, 'utf8') <= MAX_REDIS_VALUE_BYTES) {
            const ttlSeconds = Math.max(5, Math.min(300, Math.round(ttlMs / 1000)));
            redisClient
              .set(`${CACHE_KEY_PREFIX}${key}`, serialized, 'EX', ttlSeconds)
              .catch(() => {});
          }
        } catch {}
      }

      return freshData;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

export function invalidateCachePrefix(prefix) {
  if (!prefix) {
    l1Cache.clear();
    if (redisClient && redisConnected) {
      // Only delete cache keys; preserve rate-limit keys (jklu:rl:*)
      scanAndDeleteRedisPattern(`${CACHE_KEY_PREFIX}*`).catch(() => {});
    }
    return;
  }
  for (const key of l1Cache.keys()) {
    if (key.startsWith(prefix)) {
      l1Cache.delete(key);
    }
  }
  if (redisClient && redisConnected) {
    scanAndDeleteRedisPattern(`${CACHE_KEY_PREFIX}${prefix}*`).catch(() => {});
  }
}

export function getCacheMetrics() {
  const total = cacheHits + cacheMisses;
  return {
    l1Entries: l1Cache.size,
    l2RedisConnected: redisConnected,
    l2RedisHits,
    hits: cacheHits,
    misses: cacheMisses,
    hitRatePct: total > 0 ? Number(((cacheHits / total) * 100).toFixed(2)) : 100,
    stampedesPrevented,
    inFlightCount: inFlightRequests.size,
  };
}

const localRateCounters = new Map();

export async function checkRateLimitWindow(key, maxCount, windowSec) {
  const fullKey = `jklu:rl:${key}`;
  if (redisClient && redisConnected) {
    try {
      const count = await redisClient.incr(fullKey);
      if (count === 1) {
        await redisClient.expire(fullKey, windowSec);
      }
      return count <= maxCount;
    } catch {
      // Fall back to in-memory counter if Redis temporarily errors
    }
  }

  const now = Date.now();
  if (localRateCounters.size > 5000) {
    for (const [k, entry] of localRateCounters.entries()) {
      if (now >= entry.expiresAt) localRateCounters.delete(k);
    }
  }
  const existing = localRateCounters.get(fullKey);
  if (!existing || now >= existing.expiresAt) {
    localRateCounters.set(fullKey, { count: 1, expiresAt: now + windowSec * 1000 });
    return true;
  }
  existing.count += 1;
  return existing.count <= maxCount;
}
