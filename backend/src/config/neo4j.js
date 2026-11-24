import neo4j from 'neo4j-driver';

let driver = null;

export function isNeo4jConfigured() {
  // Offline Sandbox: uses local in-memory graph engine (0 connection to live Neo4j AuraDB)
  return false;
}

export function getNeo4jDriver() {
  if (!isNeo4jConfigured()) return null;
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI.trim(),
      neo4j.auth.basic(process.env.NEO4J_USER.trim(), process.env.NEO4J_PASSWORD.trim()),
      {
        connectionTimeout: 2500,
        connectionAcquisitionTimeout: 2500,
        maxConnectionPoolSize: 5,
      }
    );
  }
  return driver;
}

/**
 * Fail-open Cypher runner: returns records array on success, or null if Neo4j
 * is not configured, paused (AuraDB Free), or times out.
 */
export async function runCypher(cypher, params = {}, timeoutMs = 2500) {
  const drv = getNeo4jDriver();
  if (!drv) return null;

  const session = drv.session({
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
  try {
    const queryPromise = session.run(cypher, params);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Neo4j query timeout')), timeoutMs)
    );
    const result = await Promise.race([queryPromise, timeoutPromise]);
    return result.records;
  } catch (err) {
    console.warn('⚠️ [Neo4j] Fail-open fallback:', err?.message || err);
    return null;
  } finally {
    await session.close().catch(() => {});
  }
}

export async function checkNeo4jHealth() {
  if (!isNeo4jConfigured()) {
    return { configured: false, connected: false };
  }
  const records = await runCypher('RETURN 1 AS ok', {}, 2500);
  return {
    configured: true,
    connected: Boolean(records && records.length > 0),
  };
}
