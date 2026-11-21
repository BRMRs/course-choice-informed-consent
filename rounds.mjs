// Pure round helpers. Times are nonnegative safe-integer Unix milliseconds.
const validId = id => typeof id === 'string' && id.length >= 1 && id.length <= 64 && !/[^a-zA-Z0-9_-]/u.test(id);
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const assert = (condition, field) => { if (!condition) throw new TypeError(`Invalid round: ${field}`); };

function requireId(id) {
  assert(validId(id), 'id');
  return id;
}

/** Reads only the outer search query; malformed URLs and IDs use the legacy round. */
export function getRoundId(url) {
  try {
    const id = new URL(url).searchParams.get('round');
    return validId(id) ? id : 'default';
  } catch {
    return 'default';
  }
}

export function roundStorageKey(id) {
  return `mingli-selection-workbench-v3:${requireId(id)}`;
}

/** Returns an absolute URL string without changing the supplied URL object. */
export function createRoundUrl(currentUrl, newId) {
  requireId(newId);
  const url = new URL(currentUrl);
  url.searchParams.set('round', newId);
  url.hash = '/courses';
  return url.href;
}

function validateRecord(record) {
  assert(record !== null && typeof record === 'object' && !Array.isArray(record), 'record');
  for (const key of ['id', 'label', 'createdAt', 'updatedAt', 'courseCount', 'credits', 'submitted']) {
    assert(Object.hasOwn(record, key), key);
  }
  requireId(record.id);
  assert(typeof record.label === 'string' && record.label.trim().length > 0, 'label');
  assert(validCount(record.createdAt), 'createdAt');
  assert(validCount(record.updatedAt) && record.updatedAt >= record.createdAt, 'updatedAt');
  assert(validCount(record.courseCount), 'courseCount');
  assert(typeof record.credits === 'number' && Number.isFinite(record.credits) && record.credits >= 0 && record.credits <= Number.MAX_SAFE_INTEGER, 'credits');
  assert(typeof record.submitted === 'boolean', 'submitted');
}

/** Validates all inputs, detaches all records, deduplicates, and sorts newest first.
 * Existing duplicate IDs keep their newest record; the supplied record replaces
 * its ID unconditionally. Equal timestamps preserve insertion order.
 */
export function upsertRound(records, record) {
  assert(Array.isArray(records), 'records');
  validateRecord(record);
  const byId = new Map();
  // for...of also rejects holes instead of silently retaining corrupt entries.
  for (const existing of records) {
    validateRecord(existing);
    const previous = byId.get(existing.id);
    if (!previous || existing.updatedAt > previous.updatedAt) {
      byId.set(existing.id, structuredClone(existing));
    }
  }
  byId.set(record.id, structuredClone(record));
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** index is zero-based: index 0 gives 第 1 轮体验 (default ignores index). */
export function getRoundLabel(id, index) {
  requireId(id);
  if (id === 'default') return '原始体验';
  assert(validCount(index) && index < Number.MAX_SAFE_INTEGER, 'index');
  return `第 ${index + 1} 轮体验`;
}
