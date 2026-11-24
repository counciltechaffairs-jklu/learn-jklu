import { getDb, withTransaction } from '../config/db.js';
import { getOrSetCache, invalidateCachePrefix } from '../config/cache.js';
import { PUBLIC_BASE_URL, parsePositiveInt } from '../config/env.js';
import { requireContestStaff } from '../middleware/auth.js';
import { paperUpload } from '../middleware/uploads.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { validateHttpsUrl } from '../utils/security.js';

const router = createAsyncRouter();

async function enrichContestsWithQuestions(contests) {
  if (contests.length === 0) return [];
  const db = await getDb();
  const ids = contests.map((c) => Number(c.id));
  const qRes = await db.query(
    `SELECT * FROM contest_questions WHERE contest_id = ANY($1::int[]) ORDER BY "order" ASC, id ASC`,
    [ids]
  );
  const byContest = new Map();
  for (const q of qRes.rows) {
    const cid = Number(q.contest_id);
    if (!byContest.has(cid)) byContest.set(cid, []);
    byContest.get(cid).push(q);
  }
  return contests.map((c) => ({
    ...c,
    id: Number(c.id),
    course_id: Number(c.course_id),
    questions: byContest.get(Number(c.id)) || [],
  }));
}

function validateQuestionsMediaLinks(questions) {
  if (!Array.isArray(questions)) return { ok: true, questions: [] };
  const cleaned = [];
  for (const q of questions) {
    const check = validateHttpsUrl(q?.media_link, { required: false, label: 'media_link' });
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    cleaned.push({ ...q, media_link: check.value });
  }
  return { ok: true, questions: cleaned };
}

router.get('/admin/contests', requireContestStaff, async (_req, res) => {
  const data = await getOrSetCache('contests:all', 30 * 1000, async () => {
    const db = await getDb();
    const cRes = await db.query('SELECT * FROM daily_contests ORDER BY date DESC, id DESC');
    return enrichContestsWithQuestions(cRes.rows);
  });
  res.json(data);
});

router.get('/contests/course/:course_id', async (req, res) => {
  const courseId = parsePositiveInt(req.params.course_id);
  if (!courseId) {
    res.status(400).json({ detail: 'Invalid course ID' });
    return;
  }
  const data = await getOrSetCache(`contests:course:${courseId}`, 30 * 1000, async () => {
    const db = await getDb();
    let cRes = await db.query(
      'SELECT * FROM daily_contests WHERE course_id = $1 ORDER BY date DESC, id DESC',
      [courseId]
    );
    if (cRes.rowCount === 0) {
      cRes = await db.query('SELECT * FROM daily_contests ORDER BY date DESC, id DESC');
    }
    return enrichContestsWithQuestions(cRes.rows);
  });
  res.json(data);
});

router.get('/contests/:contest_id', async (req, res) => {
  const contestId = parsePositiveInt(req.params.contest_id);
  if (!contestId) {
    res.status(400).json({ detail: 'Invalid contest ID' });
    return;
  }
  const db = await getDb();
  const cRes = await db.query('SELECT * FROM daily_contests WHERE id = $1 LIMIT 1', [contestId]);
  if (cRes.rowCount === 0) {
    res.status(404).json({ detail: 'Contest not found' });
    return;
  }
  const enriched = await enrichContestsWithQuestions(cRes.rows);
  res.json(enriched[0]);
});

router.post('/contests', requireContestStaff, async (req, res) => {
  const { course_id, date, title, description, questions } = req.body;
  const qCheck = validateQuestionsMediaLinks(questions);
  if (!qCheck.ok) {
    res.status(400).json({ detail: qCheck.error });
    return;
  }
  const db = await getDb();
  const contest = await withTransaction(db, async (tx) => {
    const ins = await tx.query(
      `INSERT INTO daily_contests (course_id, date, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        Number(course_id || 1),
        String(date || 'Week 1'),
        String(title || 'Daily Contest'),
        description || null,
      ]
    );
    const created = ins.rows[0];
    if (Array.isArray(questions)) {
      for (let i = 0; i < qCheck.questions.length; i++) {
        const q = qCheck.questions[i];
        await tx.query(
          `INSERT INTO contest_questions (contest_id, "order", title, question, code_snippets, explanation, media_link)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [
            created.id,
            Number(q.order ?? i + 1),
            q.title || `Problem ${i + 1}`,
            q.question || '',
            JSON.stringify(q.code_snippets || {}),
            q.explanation || null,
            q.media_link || null,
          ]
        );
      }
    }
    return created;
  });

  invalidateCachePrefix('contests:');
  const enriched = await enrichContestsWithQuestions([contest]);
  res.json(enriched[0]);
});

router.put('/contests/:contest_id', requireContestStaff, async (req, res) => {
  const contestId = parsePositiveInt(req.params.contest_id);
  if (!contestId) {
    res.status(400).json({ detail: 'Invalid contest ID' });
    return;
  }
  const { course_id, date, title, description, questions } = req.body;
  const qCheck = validateQuestionsMediaLinks(questions);
  if (!qCheck.ok) {
    res.status(400).json({ detail: qCheck.error });
    return;
  }

  const db = await getDb();
  const updatedContest = await withTransaction(db, async (tx) => {
    const upd = await tx.query(
      `UPDATE daily_contests
       SET course_id = COALESCE($1, course_id),
           date = COALESCE($2, date),
           title = COALESCE($3, title),
           description = COALESCE($4, description)
       WHERE id = $5
       RETURNING *`,
      [
        course_id ? Number(course_id) : null,
        date ?? null,
        title ?? null,
        description ?? null,
        contestId,
      ]
    );
    if (upd.rowCount === 0) return null;

    if (Array.isArray(questions)) {
      await tx.query('DELETE FROM contest_questions WHERE contest_id = $1', [contestId]);
      for (let i = 0; i < qCheck.questions.length; i++) {
        const q = qCheck.questions[i];
        await tx.query(
          `INSERT INTO contest_questions (contest_id, "order", title, question, code_snippets, explanation, media_link)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [
            contestId,
            Number(q.order ?? i + 1),
            q.title || `Problem ${i + 1}`,
            q.question || '',
            JSON.stringify(q.code_snippets || {}),
            q.explanation || null,
            q.media_link || null,
          ]
        );
      }
    }
    return upd.rows[0];
  });

  if (!updatedContest) {
    res.status(404).json({ detail: 'Contest not found' });
    return;
  }

  invalidateCachePrefix('contests:');
  const enriched = await enrichContestsWithQuestions([updatedContest]);
  res.json(enriched[0]);
});

router.delete('/contests/:contest_id', requireContestStaff, async (req, res) => {
  const contestId = parsePositiveInt(req.params.contest_id);
  if (!contestId) {
    res.status(400).json({ detail: 'Invalid contest ID' });
    return;
  }
  const db = await getDb();
  await db.query('DELETE FROM daily_contests WHERE id = $1', [contestId]);
  invalidateCachePrefix('contests:');
  res.json({ message: 'Contest deleted' });
});

router.get('/questions/:question_id', async (req, res) => {
  const qId = parsePositiveInt(req.params.question_id);
  if (!qId) {
    res.status(400).json({ detail: 'Invalid question ID' });
    return;
  }
  const db = await getDb();
  const qRes = await db.query('SELECT * FROM contest_questions WHERE id = $1 LIMIT 1', [qId]);
  if (qRes.rowCount === 0) {
    res.status(404).json({ detail: 'Question not found' });
    return;
  }
  res.json(qRes.rows[0]);
});

router.post('/contests/:contest_id/questions', requireContestStaff, async (req, res) => {
  const contestId = parsePositiveInt(req.params.contest_id);
  if (!contestId) {
    res.status(400).json({ detail: 'Invalid contest ID' });
    return;
  }
  const { order, title, question, code_snippets, explanation, media_link } = req.body;
  const urlCheck = validateHttpsUrl(media_link, { required: false, label: 'media_link' });
  if (!urlCheck.ok) {
    res.status(400).json({ detail: urlCheck.error });
    return;
  }
  const db = await getDb();
  const ins = await db.query(
    `INSERT INTO contest_questions (contest_id, "order", title, question, code_snippets, explanation, media_link)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING *`,
    [
      contestId,
      Number(order || 1),
      title || 'Problem',
      question || '',
      JSON.stringify(code_snippets || {}),
      explanation || null,
      urlCheck.value,
    ]
  );
  invalidateCachePrefix('contests:');
  res.json(ins.rows[0]);
});

router.put('/questions/:question_id', requireContestStaff, async (req, res) => {
  const qId = parsePositiveInt(req.params.question_id);
  if (!qId) {
    res.status(400).json({ detail: 'Invalid question ID' });
    return;
  }
  const { order, title, question, code_snippets, explanation, media_link } = req.body;
  let validatedMediaLink = null;
  if (media_link !== undefined) {
    const urlCheck = validateHttpsUrl(media_link, { required: false, label: 'media_link' });
    if (!urlCheck.ok) {
      res.status(400).json({ detail: urlCheck.error });
      return;
    }
    validatedMediaLink = urlCheck.value;
  }
  const db = await getDb();
  const upd = await db.query(
    `UPDATE contest_questions
     SET "order" = COALESCE($1, "order"),
         title = COALESCE($2, title),
         question = COALESCE($3, question),
         code_snippets = COALESCE($4::jsonb, code_snippets),
         explanation = COALESCE($5, explanation),
         media_link = COALESCE($6, media_link)
     WHERE id = $7
     RETURNING *`,
    [
      order !== undefined ? Number(order) : null,
      title ?? null,
      question ?? null,
      code_snippets ? JSON.stringify(code_snippets) : null,
      explanation ?? null,
      validatedMediaLink,
      qId,
    ]
  );
  if (upd.rowCount === 0) {
    res.status(404).json({ detail: 'Question not found' });
    return;
  }
  invalidateCachePrefix('contests:');
  res.json(upd.rows[0]);
});

router.delete('/questions/:question_id', requireContestStaff, async (req, res) => {
  const qId = parsePositiveInt(req.params.question_id);
  if (!qId) {
    res.status(400).json({ detail: 'Invalid question ID' });
    return;
  }
  const db = await getDb();
  await db.query('DELETE FROM contest_questions WHERE id = $1', [qId]);
  invalidateCachePrefix('contests:');
  res.json({ message: 'Question deleted' });
});

router.get('/coding-announcements', async (req, res) => {
  const db = await getDb();
  if (req.query.course_id) {
    const courseId = parsePositiveInt(req.query.course_id);
    if (!courseId) {
      res.status(400).json({ detail: 'Invalid course ID' });
      return;
    }
    const result = await db.query(
      'SELECT * FROM coding_announcements WHERE course_id = $1 OR course_id IS NULL ORDER BY created_at DESC',
      [courseId]
    );
    res.json(result.rows);
    return;
  }
  const result = await db.query('SELECT * FROM coding_announcements ORDER BY created_at DESC');
  res.json(result.rows);
});

router.post(
  '/admin/coding-announcements',
  requireContestStaff,
  paperUpload.single('file'),
  async (req, res) => {
    const { course_id, title, content } = req.body;
    const attachmentUrl = req.file ? `${PUBLIC_BASE_URL}/uploads/${req.file.filename}` : null;
    const db = await getDb();
    const ins = await db.query(
      `INSERT INTO coding_announcements (course_id, title, content, attachment_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [course_id ? Number(course_id) : null, title || 'Announcement', content || '', attachmentUrl]
    );
    res.json(ins.rows[0]);
  }
);

router.delete('/admin/coding-announcements/:id', requireContestStaff, async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ detail: 'Invalid announcement ID' });
    return;
  }
  const db = await getDb();
  await db.query('DELETE FROM coding_announcements WHERE id = $1', [id]);
  res.json({ message: 'Announcement deleted' });
});

export default router;
