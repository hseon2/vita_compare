import type { SessionType } from "../api/types";

function fileDateKey(file: File): string {
  return new Date(file.lastModified).toISOString().slice(0, 10);
}

/**
 * 한 번에 선택한 사진들을 촬영일(파일 수정일) 기준으로 슬롯에 1차 배정한다.
 * 정확한 분류가 아니라 초벌 구분이므로, 이후 화면에서 사람이 다시 확인/수정할 수 있어야 한다.
 * - 표준 모드(2슬롯): 가장 이른 날짜 -> 시작일, 그 외 전부 -> 종료일
 * - 장기 모드(3슬롯): 가장 이른 날짜 -> 시작일, 가장 늦은 날짜 -> 종료일, 그 사이 -> 중간일
 * - 날짜를 하나도 구분할 수 없으면(전부 같은 날) 첫 슬롯에 전부 담는다.
 */
export function groupFilesByDate(
  files: File[],
  slots: SessionType[],
): Partial<Record<SessionType, { date: string; files: File[] }>> {
  if (files.length === 0) return {};
  const dated = files.map((f) => ({ file: f, date: fileDateKey(f) }));
  const uniqueDates = Array.from(new Set(dated.map((d) => d.date))).sort();

  if (uniqueDates.length <= 1) {
    const only = uniqueDates[0] ?? new Date().toISOString().slice(0, 10);
    return { [slots[0]]: { date: only, files } };
  }

  const minDate = uniqueDates[0];
  const maxDate = uniqueDates[uniqueDates.length - 1];
  const result: Partial<Record<SessionType, { date: string; files: File[] }>> = {};

  if (slots.length === 2) {
    result[slots[0]] = { date: minDate, files: dated.filter((d) => d.date === minDate).map((d) => d.file) };
    result[slots[1]] = { date: maxDate, files: dated.filter((d) => d.date !== minDate).map((d) => d.file) };
    return result;
  }

  const mid = dated.filter((d) => d.date !== minDate && d.date !== maxDate);
  result[slots[0]] = { date: minDate, files: dated.filter((d) => d.date === minDate).map((d) => d.file) };
  if (mid.length > 0) {
    result[slots[1]] = { date: mid[0].date, files: mid.map((d) => d.file) };
  }
  result[slots[2]] = { date: maxDate, files: dated.filter((d) => d.date === maxDate).map((d) => d.file) };
  return result;
}
