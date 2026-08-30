import { describe, expect, it } from 'vitest';

import { dedupeByConceptId } from './dedupe-concepts';

describe('dedupeByConceptId', () => {
  it('giữ lần xuất hiện đầu tiên của mỗi conceptId và không đổi thứ tự', () => {
    const firstA = { conceptId: 'a', score: 0.3 };
    const items = [firstA, { conceptId: 'b', score: 0.7 }, { conceptId: 'a', score: 0.9 }];

    const result = dedupeByConceptId(items);

    expect(result).toEqual([firstA, { conceptId: 'b', score: 0.7 }]);
    expect(result[0]).toBe(firstA);
  });

  it('trả mảng rỗng khi không có khái niệm', () => {
    expect(dedupeByConceptId([])).toEqual([]);
  });
});
