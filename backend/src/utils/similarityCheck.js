import crypto from 'node:crypto';
import path from 'node:path';

const TEXT_CODE_EXTS = new Set([
  '.txt', '.py', '.cpp', '.cc', '.c', '.h', '.hpp', '.ipynb', '.csv',
  '.js', '.ts', '.tsx', '.jsx', '.java', '.md', '.html', '.json', '.sql',
]);

function stripCommentsAndNormalize(raw) {
  let s = String(raw || '');
  // Strip C/JS block comments, C/JS single-line comments, and Python/shell # comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/\/\/[^\n]*/g, ' ');
  s = s.replace(/(^|\s)#[^\n]*/g, ' ');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractComparableText(submission) {
  const parts = [];
  if (submission.submission_notes) {
    parts.push(String(submission.submission_notes));
  }
  const fname = String(submission.file_name || '');
  const ext = path.extname(fname).toLowerCase();
  const mime = String(submission.file_mime || '').toLowerCase();
  const isTextLike =
    TEXT_CODE_EXTS.has(ext) ||
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('python');

  if (submission.file_data && isTextLike) {
    try {
      const rawBuf = Buffer.from(submission.file_data);
      const utf8 = rawBuf.toString('utf8');
      if (ext === '.ipynb') {
        try {
          const nb = JSON.parse(utf8);
          if (Array.isArray(nb?.cells)) {
            parts.push(
              nb.cells
                .map((c) => (Array.isArray(c.source) ? c.source.join('') : String(c.source || '')))
                .join('\n')
            );
          } else {
            parts.push(utf8);
          }
        } catch {
          parts.push(utf8);
        }
      } else {
        parts.push(utf8);
      }
    } catch {
      // Ignore unreadable binary buffers
    }
  }

  return stripCommentsAndNormalize(parts.join('\n'));
}

export function buildShingles(normalizedText, k = 4) {
  const tokens = String(normalizedText || '')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  if (tokens.length === 0) return set;
  if (tokens.length <= k) {
    set.add(tokens.join(' '));
    return set;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    set.add(tokens.slice(i, i + k).join(' '));
  }
  return set;
}

function getSubmissionHash(sub) {
  if (sub.file_sha256) return String(sub.file_sha256).trim().toLowerCase();
  if (sub.file_data) {
    return crypto.createHash('sha256').update(Buffer.from(sub.file_data)).digest('hex');
  }
  return null;
}

/**
 * Computes pairwise text/code & file-hash similarity across non-teammate submissions.
 * Never flags submissions belonging to the same assignment group_id.
 */
export function computeAssignmentSimilarity(submissions = [], thresholdPct = 40) {
  const prepped = submissions.map((s) => {
    const text = extractComparableText(s);
    return {
      id: Number(s.id),
      student_id: Number(s.student_id),
      student_name: s.student_name || s.student_email || `Student #${s.student_id}`,
      student_roll_no: s.student_roll_no || '',
      group_id: s.group_id ? Number(s.group_id) : null,
      hash: getSubmissionHash(s),
      text,
      shingles: buildShingles(text, 4),
    };
  });

  const bySubmissionId = {};
  for (const item of prepped) {
    bySubmissionId[item.id] = {
      max_similarity_pct: 0,
      matched_with_id: null,
      matched_with_name: null,
      match_reason: 'LOW',
    };
  }

  const flaggedPairs = [];

  for (let i = 0; i < prepped.length; i++) {
    for (let j = i + 1; j < prepped.length; j++) {
      const a = prepped[i];
      const b = prepped[j];
      if (a.group_id && b.group_id && a.group_id === b.group_id) continue;

      let pct = 0;
      let reason = 'LOW';

      if (a.hash && b.hash && a.hash === b.hash) {
        pct = 100;
        reason = 'EXACT_HASH';
      } else if (a.shingles.size > 0 && b.shingles.size > 0) {
        let intersection = 0;
        const [smaller, larger] =
          a.shingles.size <= b.shingles.size ? [a.shingles, b.shingles] : [b.shingles, a.shingles];
        for (const sh of smaller) {
          if (larger.has(sh)) intersection += 1;
        }
        const union = a.shingles.size + b.shingles.size - intersection;
        const jaccard = union > 0 ? (intersection / union) * 100 : 0;
        const containment = smaller.size > 0 ? (intersection / smaller.size) * 100 : 0;
        pct = Math.round(Math.max(jaccard, containment * 0.85));
        if (pct >= thresholdPct) reason = 'TOKEN_OVERLAP';
      }

      if (pct > bySubmissionId[a.id].max_similarity_pct) {
        bySubmissionId[a.id] = {
          max_similarity_pct: pct,
          matched_with_id: b.id,
          matched_with_name: b.student_name,
          match_reason: reason,
        };
      }
      if (pct > bySubmissionId[b.id].max_similarity_pct) {
        bySubmissionId[b.id] = {
          max_similarity_pct: pct,
          matched_with_id: a.id,
          matched_with_name: a.student_name,
          match_reason: reason,
        };
      }

      if (pct >= thresholdPct) {
        flaggedPairs.push({
          submission_a_id: a.id,
          student_a_name: a.student_name,
          student_a_roll_no: a.student_a_roll_no,
          submission_b_id: b.id,
          student_b_name: b.student_name,
          student_b_roll_no: b.student_b_roll_no,
          similarity_pct: pct,
          match_reason: reason,
        });
      }
    }
  }

  flaggedPairs.sort((x, y) => y.similarity_pct - x.similarity_pct);

  return {
    checked_count: prepped.length,
    threshold_pct: thresholdPct,
    flagged_pairs: flaggedPairs,
    by_submission_id: bySubmissionId,
  };
}
