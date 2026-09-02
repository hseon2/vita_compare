import type { Mode, PhotosGroupedResponse, SessionType } from "../api/types";

/** GET /photos에는 mode가 직접 없지만, missing_compos에 "mid" 키가 있으면 장기모드다
 * (backend/state/session_store.py의 _missing_compos는 long 모드일 때만 mid 키를 만든다). */
export function deriveModeFromPhotos(resp: PhotosGroupedResponse): Mode {
  return "mid" in resp.missing_compos ? "long" : "standard";
}

export function sessionTypesForMode(mode: Mode): SessionType[] {
  return mode === "long" ? ["start", "mid", "end"] : ["start", "end"];
}

// backend/config.py의 STANDARD_MODE_SET_PAIRING / LONG_MODE_SET_PAIRING 미러
export function getSetPairing(mode: Mode): Array<[SessionType, SessionType]> {
  return mode === "long" ? [["start", "mid"], ["mid", "end"]] : [["start", "end"]];
}

// "분류 확인" 화면(2단계)은 사진을 한 장씩 순차로 보여주며 구도/세션타입을 확정하는
// OptionSelectPage로, "분류/크롭" 화면(3단계)은 확정된 사진을 2장씩 짝지어 순차로 크롭하는
// CropAdjustPage로 각각 분리되어 있다.
export type WizardStep = "upload" | "options" | "crop" | "match" | "generate";

export const STEP_ORDER: Array<{ step: WizardStep; label: string; path: string }> = [
  { step: "upload", label: "업로드", path: "upload" },
  { step: "options", label: "옵션 선택", path: "options" },
  { step: "crop", label: "크롭", path: "crop" },
  { step: "match", label: "매칭 확인", path: "match" },
  { step: "generate", label: "생성", path: "generate" },
];

interface PhotoLike {
  manually_confirmed: boolean;
}

/** 같은 자리(세션타입+구도)에 사진이 여러 장(중복) 배정된 경우 어떤 걸 "그" 사진으로 볼지
 * 정하는 공통 규칙 - 크롭 화면(사용자가 직접 확인/수정)·매칭 확인·PPT 생성이 전부 이 규칙으로
 * 통일돼야 사용자가 크롭 화면에서 고른 사진이 실제로 최종 결과물에 쓰인다. 이미 확인된
 * (manually_confirmed) 사진을 최우선으로, 그 외엔 원래 순서(=업로드 순서, 입력 배열이 이미
 * 그 순서라고 가정)를 그대로 유지한다 - Array.sort는 안정 정렬이라 동점끼리는 순서가 안
 * 바뀐다. photo_id는 무작위 문자열이라 정렬 기준으로 쓰면 안 된다. */
export function sortPhotoCandidates<T extends PhotoLike>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => (a.manually_confirmed === b.manually_confirmed ? 0 : a.manually_confirmed ? -1 : 1));
}

export function pickPrimaryPhoto<T extends PhotoLike>(candidates: T[]): T | undefined {
  return sortPhotoCandidates(candidates)[0];
}

export function computeReachability(
  resp: PhotosGroupedResponse | undefined,
): Record<WizardStep, boolean> {
  if (!resp) {
    return { upload: true, options: false, crop: false, match: false, generate: false };
  }
  const hasPhotos = resp.photos.length > 0;
  const classifiedPhotos = resp.photos.filter((p) => p.compos_id > 0);
  const anyClassified = classifiedPhotos.length > 0;
  const allOptionsConfirmed = hasPhotos && resp.photos.every((p) => p.option_confirmed);
  // 같은 자리(세션타입+구도)에 중복 배정된 사진들 중에는 "대표"(pickPrimaryPhoto) 하나만
  // 확인되면 된다 - 중복으로 밀려난 나머지가 영원히 미확인 상태로 남아 다음 단계가 막히면
  // 안 된다.
  const bySlot = new Map<string, typeof classifiedPhotos>();
  for (const p of classifiedPhotos) {
    const key = `${p.session_type}:${p.compos_id}`;
    const arr = bySlot.get(key) ?? [];
    arr.push(p);
    bySlot.set(key, arr);
  }
  const allCropConfirmed =
    anyClassified &&
    Array.from(bySlot.values()).every((group) => pickPrimaryPhoto(group)?.manually_confirmed);

  return {
    upload: true,
    options: hasPhotos,
    crop: allOptionsConfirmed,
    match: allCropConfirmed,
    // "생성"은 크롭까지 끝나야 의미가 있는데 예전엔 "구도 하나라도 분류됨"만 보면 돼서
    // 3(크롭)·4(매칭 확인)는 회색인데 5(생성)만 눌리는 이상한 상태가 됐다(실사용 중 발견) -
    // 매칭 확인과 같은 조건으로 맞춘다.
    generate: allCropConfirmed,
  };
}
