import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { ALLOWED_ORIGINS, IS_PRODUCTION } from './config/env.js';
import { apiLimiter, trackRequestMetrics } from './middleware/rateLimiters.js';
import { getAuthenticatedUser, isFullAdminUser } from './middleware/auth.js';
import { getMaintenanceStatus } from './utils/maintenance.js';
import systemRoutes from './routes/system.js';
import authRoutes from './routes/auth.js';
import coursesRoutes from './routes/courses.js';
import papersRoutes from './routes/papers.js';
import adminRoutes from './routes/admin.js';
import contestsRoutes from './routes/contests.js';
import graphRoutes from './routes/graph.js';
import facultyRoutes from './routes/faculty.js';
import classroomRoutes from './routes/classroom.js';

const app = express();
app.set('trust proxy', 1);

const FRAME_ANCESTORS = [
  "'self'",
  'https://exam-quiz-portal-lib-jklu.vercel.app',
  ...(IS_PRODUCTION ? [] : ['http://localhost:*', 'http://127.0.0.1:*']),
  ...Array.from(ALLOWED_ORIGINS).filter((o) => o.startsWith('https://')),
];

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        objectSrc: ["'self'"],
        styleSrc: ["'unsafe-inline'"],
        frameAncestors: Array.from(new Set(FRAME_ANCESTORS)),
      },
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (
        ALLOWED_ORIGINS.has(normalized) ||
        /^https:\/\/(exam-quiz-portal|paper-portal)[a-z0-9-]*\.vercel\.app$/i.test(normalized) ||
        (!IS_PRODUCTION && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized))
      ) {
        return callback(null, true);
      }
      console.warn('⚠️ [CORS] Blocked origin:', normalized);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Disposition',
      'X-Total-Count',
      'X-Page',
      'X-Limit',
    ],
  })
);
app.use(compression());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(apiLimiter);
app.use(trackRequestMetrics);

// Server-side Maintenance Mode enforcement (returns 503 for non-admin requests)
const MAINTENANCE_BYPASS_PATHS = new Set([
  '/',
  '/wake',
  '/health',
  '/maintenance-status',
  '/captcha/challenge',
  '/admin-login',
  '/login',
  '/me',
  '/admin/maintenance',
]);

app.use(async (req, res, next) => {
  try {
    if (req.method === 'OPTIONS' || MAINTENANCE_BYPASS_PATHS.has(req.path)) {
      return next();
    }
    const status = await getMaintenanceStatus();
    if (!status.maintenance_mode) {
      return next();
    }
    const user = await getAuthenticatedUser(req);
    if (isFullAdminUser(user)) {
      return next();
    }
    res.setHeader('Retry-After', '300');
    res.status(503).json({
      detail: status.message || 'Service is currently under scheduled maintenance.',
      maintenance_mode: true,
    });
  } catch {
    next();
  }
});

app.use('/', systemRoutes);
app.use('/', authRoutes);
app.use('/courses', coursesRoutes);
app.use('/', papersRoutes);
app.use('/admin', adminRoutes);
app.use('/', contestsRoutes);
app.use('/', graphRoutes);
app.use('/', facultyRoutes);
app.use('/', classroomRoutes);

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ detail: 'File size must be 500 KB or less.' });
    return;
  }
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({ detail: 'Error' });
});

export default app;
