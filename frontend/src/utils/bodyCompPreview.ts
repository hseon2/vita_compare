// backend/ppt_generator/generate_ppt.py의 _parse_value/_format_change를 미러한 클라이언트
// 미리보기용 계산. 실제 PPT에 들어가는 변화량은 서버(generate_ppt.py)가 최종 계산하므로
// 이 파일은 화면 미리보기 용도로만 쓰고, 결과가 서버와 100% 동일할 필요는 없다.

const NUM_RE = /^\s*(-?\d+(?:\.\d+)?)\s*(.*)$/;

export function parseValue(text: string | null | undefined): { value: number | null; unit: string } {
  if (text == null || text === "") return { value: null, unit: "" };
  const m = NUM_RE.exec(String(text));
  if (!m) return { value: null, unit: String(text) };
  return { value: parseFloat(m[1]), unit: m[2].trim() };
}

// Python의 f"{x:g}"와 유사하게: 정수면 소수점 생략, 아니면 불필요한 trailing zero 제거
function formatG(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return parseFloat(n.toPrecision(6)).toString();
}

export function formatChange(start: string, end: string): string {
  const { value: sv, unit } = parseValue(start);
  const { value: ev } = parseValue(end);
  if (sv == null || ev == null) return "-";

  const diff = Math.round((ev - sv) * 100) / 100;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
  const diffStr = diff === 0 ? "0" : formatG(diff);
  return `${sign}${diffStr}${unit}`;
}
