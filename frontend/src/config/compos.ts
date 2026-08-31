// backend/ppt_generator/compos.py + backend/config.py(CROP_RATIOS, DEFAULT_BODY_COMP_LABELS)를 미러.
// 백엔드 값이 바뀌면 이 파일도 함께 갱신할 것.

export const COMPOS: Array<[number, string]> = [
  [1, "전면_전신(1)"],
  [2, "전면_전신(2)"],
  [3, "전면_체간"],
  [4, "전면_상반신(1)"],
  [5, "전면_상반신(2)"],
  [6, "전면_하반신"],
  [7, "측면_전신"],
  [8, "측면_체간"],
  [9, "측면_상반신"],
  [10, "측면_하반신"],
  [11, "후면_전신(1)"],
  [12, "후면_전신(2)"],
  [13, "후면_체간"],
  [14, "후면_상반신(1)"],
  [15, "후면_상반신(2)"],
  [16, "후면_하반신"],
];

export const WIDE_COMPOS = new Set([5, 15]); // 팔벌림(가로형) 구도

const LABEL_BY_ID = new Map(COMPOS);

export function labelFor(composId: number): string {
  return LABEL_BY_ID.get(composId) ?? "미분류";
}

const FULL_COMPOS = new Set([1, 2, 7, 11, 12]);
const TORSO_COMPOS = new Set([3, 8, 13]);
const LOWER_COMPOS = new Set([6, 10, 16]);

export type ComposCategory = "full" | "torso" | "upper" | "lower";

export function categoryFor(composId: number): ComposCategory {
  if (FULL_COMPOS.has(composId)) return "full";
  if (TORSO_COMPOS.has(composId)) return "torso";
  if (LOWER_COMPOS.has(composId)) return "lower";
  return "upper"; // 4,5,9,14,15 (5,15는 WIDE_COMPOS)
}

// (width, height) 비율. config.CROP_RATIOS와 동일한 규칙.
export function cropRatioFor(composId: number): [number, number] {
  if (WIDE_COMPOS.has(composId)) return [16, 9];
  if (FULL_COMPOS.has(composId)) return [3, 4];
  return [4, 5]; // 체간 / 상반신(보통) / 하반신
}

export const DEFAULT_BODY_COMP_LABELS = [
  "체중",
  "신장",
  "체지방량",
  "골격근량",
  "체지방률",
  "BMI",
  "복부지방률",
  "복부둘레",
  "엉덩이둘레",
  "가슴둘레",
  "우측상완둘레",
  "우측대퇴둘레",
];
