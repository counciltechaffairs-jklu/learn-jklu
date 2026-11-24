import { requireAdminOrStaff, requireFullAdmin } from '../middleware/auth.js';
import {
  getRelatedForCourse,
  syncCatalogToNeo4j,
  getGraphStats,
} from '../utils/graphService.js';
import { createAsyncRouter } from '../utils/routerHelper.js';

const router = createAsyncRouter();

router.get('/graph/related/:course_code', async (req, res) => {
  const data = await getRelatedForCourse(req.params.course_code);
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.json(data);
});

router.get('/admin/graph/status', requireAdminOrStaff, async (_req, res) => {
  const stats = await getGraphStats();
  res.json(stats);
});

router.post('/admin/graph/sync', requireFullAdmin, async (_req, res) => {
  try {
    const result = await syncCatalogToNeo4j();
    res.json({
      message: `Synced ${result.synced_courses} courses, ${result.synced_papers} papers, and ${result.progression_edges} progression edges to Neo4j`,
      ...result,
    });
  } catch (err) {
    res.status(503).json({ detail: err.message || 'Neo4j sync failed' });
  }
});

export default router;
