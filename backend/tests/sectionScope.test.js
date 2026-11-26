import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSectionName,
  parseSectionsList,
  isUnrestrictedSections,
  canStaffAccessSection,
  resolvePostTargetsForStaff,
  canStaffMutateItem,
  canStaffModerateComments,
  canStaffGradeTarget,
  canStudentViewTargets,
} from '../src/utils/sectionScope.js';

describe('sectionScope utilities', () => {
  it('normalizes section names and ALL aliases consistently', () => {
    assert.equal(normalizeSectionName(''), 'ALL');
    assert.equal(normalizeSectionName('all sections'), 'ALL');
    assert.equal(normalizeSectionName('  Sec   A '), 'Sec A');
  });

  it('parses comma strings, JSON strings, and arrays into deduplicated lists', () => {
    assert.deepEqual(parseSectionsList(null), ['ALL']);
    assert.deepEqual(parseSectionsList('Sec A, Sec B, sec a'), ['Sec A', 'Sec B']);
    assert.deepEqual(parseSectionsList('["Sec B", "ALL"]'), ['ALL']);
    assert.deepEqual(parseSectionsList(['Sec A', 'Sec C']), ['Sec A', 'Sec C']);
    assert.equal(isUnrestrictedSections(['ALL']), true);
    assert.equal(isUnrestrictedSections(['Sec A']), false);
  });

  it('enforces staff section access, posting, editing, moderation, and grading rules', () => {
    const secAPerm = {
      is_admin: false,
      assigned_sections: ['Sec A'],
      can_grade: true,
      can_announce: true,
    };
    const adminPerm = {
      is_admin: true,
      assigned_sections: ['Sec A'],
      can_grade: true,
    };

    assert.equal(canStaffAccessSection(secAPerm, 'Sec A'), true);
    assert.equal(canStaffAccessSection(secAPerm, 'Sec B'), false);
    assert.equal(canStaffAccessSection(adminPerm, 'Sec B'), true);

    // Posting: Sec A prof can post to Sec A or All Sections, but not Sec B exclusively
    assert.deepEqual(resolvePostTargetsForStaff(secAPerm, ['ALL']), {
      ok: true,
      sections: ['ALL'],
    });
    assert.deepEqual(resolvePostTargetsForStaff(secAPerm, ['Sec A']), {
      ok: true,
      sections: ['Sec A'],
    });
    const blocked = resolvePostTargetsForStaff(secAPerm, ['Sec B']);
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /Sec B/);

    // Mutation & moderation isolation
    assert.equal(canStaffMutateItem(secAPerm, ['ALL'], 99, 10), false);
    assert.equal(canStaffMutateItem(secAPerm, ['ALL'], 10, 10), true);
    assert.equal(canStaffMutateItem(secAPerm, ['Sec A'], 99, 10), true);
    assert.equal(canStaffMutateItem(secAPerm, ['Sec B'], 10, 10), false);

    assert.equal(canStaffModerateComments(secAPerm, ['ALL']), true);
    assert.equal(canStaffModerateComments(secAPerm, ['Sec B']), false);

    // Grading shared (ALL) assignments vs section-specific assignments
    assert.equal(canStaffGradeTarget(secAPerm, ['ALL'], 'Sec B'), true);
    assert.equal(canStaffGradeTarget(secAPerm, ['Sec B'], 'Sec B'), false);
    assert.equal(canStaffGradeTarget({ ...secAPerm, can_grade: false }, ['ALL'], 'Sec A'), false);
  });

  it('controls student visibility by section targets', () => {
    assert.equal(canStudentViewTargets('Sec B', ['ALL']), true);
    assert.equal(canStudentViewTargets('Sec B', ['Sec A', 'Sec B']), true);
    assert.equal(canStudentViewTargets('Sec C', ['Sec A', 'Sec B']), false);
  });
});
