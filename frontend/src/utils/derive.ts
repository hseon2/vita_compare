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
  const allCropConfirmed = anyClassified && classifiedPhotos.every((p) => p.manually_confirmed);

  return {
    upload: true,
    options: hasPhotos,
    crop: allOptionsConfirmed,
    match: allCropConfirmed,
    generate: anyClassified,
  };
}
