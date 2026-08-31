// 16개 구도별 전/후 예시(참고) 사진. public/guides/before-{id}.png, after-{id}.png로 제공된다.
// 실제 인물 사진이라 공개 저장소에는 올리지 않는다 (.gitignore 참고) - 로컬에서만 사용.
const AVAILABLE_BEFORE = new Set(Array.from({ length: 16 }, (_, i) => i + 1));
const AVAILABLE_AFTER = new Set(Array.from({ length: 16 }, (_, i) => i + 1));

export type GuideSide = "before" | "after";

/** 세션타입(시작/중간/마지막)을 예시 사진의 전/후 구분으로 근사 매핑. */
export function sideForSessionType(sessionType: string): GuideSide {
  return sessionType === "end" ? "after" : "before";
}

/** 해당 구도/전후에 맞는 예시 사진 URL. 한쪽만 없으면 반대쪽으로 대체하고,
 * 둘 다 없으면 null(호출부에서 범용 가이드로 폴백). */
export function getGuideImageUrl(composId: number, side: GuideSide): string | null {
  if (side === "before" && AVAILABLE_BEFORE.has(composId)) return `/guides/before-${composId}.png`;
  if (side === "after" && AVAILABLE_AFTER.has(composId)) return `/guides/after-${composId}.png`;
  if (side === "before" && AVAILABLE_AFTER.has(composId)) return `/guides/after-${composId}.png`;
  if (side === "after" && AVAILABLE_BEFORE.has(composId)) return `/guides/before-${composId}.png`;
  return null;
}
