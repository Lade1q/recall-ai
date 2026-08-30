/**
 * Bỏ khái niệm trùng `conceptId`, giữ lần xuất hiện đầu.
 *
 * `InterviewSession.conceptQueue` là một mảng JSON và **không có gì chặn cùng một `conceptId`
 * nằm trong đó nhiều lần** — đo trên dữ liệu thật: phiên `632b549e` có hàng đợi ba phần tử trỏ
 * cùng một khái niệm, nên `GET /interviews` trả `concepts` gồm ba bản y hệt, và `/summary`
 * cũng vậy (cả hai đều duyệt theo `queue`).
 *
 * Không lọc thì màn này hỏng hai đường: ba chip biến động giống hệt nhau cho cùng một điểm, và
 * `key={conceptId}` trùng nhau trong React. Kết quả của một khái niệm là MỘT con số dù hàng đợi
 * có nhắc tới nó mấy lần — nên hiện một lần mới là đúng dữ liệu, không phải giấu bớt.
 *
 * `conceptTotal` phía server vẫn là độ dài hàng đợi và cố ý không đụng tới: đó là số lượt hàng
 * đợi định đi qua, một đại lượng khác.
 */
export function dedupeByConceptId<T extends { conceptId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.conceptId)) continue;
    seen.add(item.conceptId);
    result.push(item);
  }
  return result;
}
