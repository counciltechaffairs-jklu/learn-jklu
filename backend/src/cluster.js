import 'dotenv/config';
import cluster from 'node:cluster';
import os from 'node:os';

// Guard: Embedded PGlite is single-writer and cannot safely be opened by multiple cluster workers.
const isExternalPg = /^postgres(?:ql)?:\/\//i.test(String(process.env.DATABASE_URL || '').trim());
if (!isExternalPg) {
  console.warn(
    '⚠️ [Cluster] External PostgreSQL DATABASE_URL is not configured (embedded PGlite single-writer mode). Running single worker to prevent data corruption.'
  );
  await import('./server.js');
} else {
  const NUM_WORKERS = Math.max(2, Math.min(os.cpus().length, 8));

  if (cluster.isPrimary) {
    console.log(
      `⚡ Starting Learn JKLU Express Cluster with ${NUM_WORKERS} workers (PostgreSQL Pool mode)...`
    );
    for (let i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
    }
    cluster.on('exit', (worker) => {
      console.warn(`⚠️ Worker ${worker.process.pid} exited. Spawning replacement...`);
      cluster.fork();
    });
  } else {
    await import('./server.js');
  }
}
