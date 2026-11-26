import 'dotenv/config';
import http from 'node:http';
import app from './app.js';
import { initDatabaseAndSeed, getDb, closeDb } from './config/db.js';
import { closeCache } from './config/cache.js';
import { checkNeo4jHealth, closeNeo4j } from './config/neo4j.js';
import { flushPendingDownloadCounts } from './utils/pdfStorage.js';

const PORT = Number(process.env.PORT || 8001);
let httpServer = null;
let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 [Shutdown] Received ${signal}. Flushing state and closing connections...`);
  try {
    await flushPendingDownloadCounts();
  } catch (err) {
    console.warn('[Shutdown] Failed to flush download counts:', err?.message || err);
  }
  if (httpServer) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      httpServer.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  try {
    await closeCache();
  } catch {}
  try {
    await closeNeo4j();
  } catch {}
  try {
    await closeDb();
  } catch (err) {
    console.warn('[Shutdown] Failed to close DB cleanly:', err?.message || err);
  }
  console.log('✅ [Shutdown] Clean exit complete.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function bootstrap() {
  const startMs = Date.now();
  await initDatabaseAndSeed();
  const db = await getDb();
  const neo4jHealth = await checkNeo4jHealth().catch(() => ({ configured: false, connected: false }));

  httpServer = http.createServer(app);
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.maxConnections = 5000;

  httpServer.listen(PORT, '0.0.0.0', () => {
    const graphLabel = neo4jHealth.connected
      ? 'Neo4j AuraDB Connected'
      : neo4jHealth.configured
        ? 'Neo4j Fail-Open Fallback'
        : 'In-Memory Graph Engine';
    console.log(`\n====================================================================`);
    console.log(`🚀 Learn JKLU 2.0 Express.js Engine listening on http://localhost:${PORT}`);
    console.log(`🐘 Database Engine : ${db.engineName}`);
    console.log(`🕸️ Graph Engine    : ${graphLabel}`);
    console.log(`⚡ Startup Time    : ${Date.now() - startMs} ms`);
    console.log(`====================================================================\n`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start Express server:', err);
  process.exit(1);
});
