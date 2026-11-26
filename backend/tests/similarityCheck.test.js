import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractComparableText,
  buildShingles,
  computeAssignmentSimilarity,
} from '../src/utils/similarityCheck.js';

describe('similarityCheck utilities', () => {
  it('extracts comparable text and builds k-gram shingles cleanly', () => {
    const text = extractComparableText({
      submission_notes: 'Binary Search Tree Insertion and Deletion Algorithm Analysis Report',
    });
    assert.match(text, /binary search tree/);

    const shingles = buildShingles(text, 3);
    assert.ok(shingles.size >= 5);
    assert.equal(buildShingles('', 4).size, 0);
    assert.equal(buildShingles('short phrase', 4).size, 1);
  });

  it('flags near-identical submissions and leaves distinct submissions unflagged', () => {
    const sharedEssay =
      'Dynamic programming breaks complex optimization problems into overlapping subproblems and memoizes intermediate states to eliminate exponential recomputation overhead during recursion.';
    const distinctEssay =
      'Red-black trees guarantee logarithmic worst-case lookup latency through color invariants, uncle recoloring rules, and localized left or right tree rotations after insertions.';

    const report = computeAssignmentSimilarity(
      [
        { id: 1, student_id: 101, student_name: 'Alice', submission_notes: sharedEssay },
        { id: 2, student_id: 102, student_name: 'Bob', submission_notes: `${sharedEssay} Extra conclusion.` },
        { id: 3, student_id: 103, student_name: 'Charlie', submission_notes: distinctEssay },
        { id: 4, student_id: 104, student_name: 'Short', submission_notes: 'done' },
      ],
      40
    );

    assert.equal(report.checked_count, 4);
    assert.equal(report.flagged_pairs.length, 1);
    const pair = report.flagged_pairs[0];
    assert.ok(pair.similarity_pct >= 70);
    assert.ok(
      (pair.submission_a_id === 1 && pair.submission_b_id === 2) ||
        (pair.submission_a_id === 2 && pair.submission_b_id === 1)
    );
  });
});
