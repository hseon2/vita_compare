import { categoryFor, WIDE_COMPOS, type ComposCategory } from "./compos";

// 요구사항 5.4의 "아랫입술 아래 ~ 무릎뼈 아래" 예시를 참고한 구도 카테고리별 하단 가이드 문구.
// 실제 병원 촬영 가이드가 확정되면 이 맵만 교체하면 된다.
const HINTS: Record<ComposCategory, string> = {
  full: "정수리 위 여유 ~ 발끝까지 프레임 안에",
  torso: "쇄골 아래 ~ 골반(허벅지 시작) 위",
  upper: "아랫입술 아래 ~ 골반 위",
  lower: "골반 아래 ~ 발끝까지",
};

const WIDE_HINT = "아랫입술 아래 ~ 골반 위 (팔 벌린 폭 전체 포함)";

export function getCropHint(composId: number): string {
  if (WIDE_COMPOS.has(composId)) return WIDE_HINT;
  return HINTS[categoryFor(composId)];
}
