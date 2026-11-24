import crypto from 'node:crypto';

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 7;
export const LEGACY_STATIC_JOIN_CODES = ['DSA2026', 'DAA2026', 'DBMS26X', 'BSTAT26', 'MKTR26A'];

/**
 * Generates an unpredictable uppercase join code using crypto.randomInt
 * and an ambiguity-free alphabet (excludes 0/O and 1/I/L).
 */
export function generateRandomJoinCode(length = JOIN_CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET[crypto.randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Generates a unique random join code guaranteed not to collide with any
 * existing course_offerings.join_code or optional excludeCode.
 */
export async function generateUniqueJoinCode(
  db,
  { length = JOIN_CODE_LENGTH, excludeCode = null, maxAttempts = 20 } = {}
) {
  const excluded = excludeCode ? String(excludeCode).trim().toUpperCase() : null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateRandomJoinCode(length);
    if (excluded && candidate === excluded) continue;

    const existing = await db.query(
      'SELECT 1 FROM course_offerings WHERE UPPER(join_code) = $1 LIMIT 1',
      [candidate]
    );
    if (existing.rowCount === 0) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate unique random join code after maximum attempts');
}
