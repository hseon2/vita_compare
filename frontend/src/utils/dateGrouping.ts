import { parse as exifParse } from "exifr";
import type { Mode, SessionType } from "../api/types";

export interface DateGroup {
  date: string; // "YYYY-MM-DD"
  files: File[];
}

async function getCaptureDate(file: File): Promise<Date> {
  try {
    const exif = await exifParse(file, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] });
    const d: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  } catch {
    // EXIF가 없는 포맷(PNG 등)이거나 파싱 실패 - 파일 수정일로 폴백
  }
  return new Date(file.lastModified);
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 파일들을 촬영일(EXIF 우선, 없으면 파일 수정일) 기준으로 날짜별 그룹으로 묶어 오름차순 정렬해 반환. */
export async function groupFilesByDate(files: File[]): Promise<DateGroup[]> {
  const map = new Map<string, File[]>();
  for (const file of files) {
    const date = await getCaptureDate(file);
    const key = toDateKey(date);
    const arr = map.get(key) ?? [];
    arr.push(file);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, groupFiles]) => ({ date, files: groupFiles }));
}

export type SlotChoice = SessionType | "unassigned";

/** 날짜 그룹 인덱스로부터 기본 슬롯을 추정: 가장 이른 날짜=시작, 가장 늦은 날짜=마지막,
 * 그 사이(장기모드만)=중간. 표준모드에서 중간 날짜가 있으면 자동 배정하지 않고 사용자가
 * 직접 고르게 한다 (섣부른 자동 병합으로 잘못된 사진이 섞이는 것을 방지). */
export function defaultSlotForGroup(index: number, total: number, mode: Mode): SlotChoice {
  if (total === 1) return "start";
  if (index === 0) return "start";
  if (index === total - 1) return "end";
  return mode === "long" ? "mid" : "unassigned";
}
