// backend/config.py의 분류/크롭 관련 상수를 그대로 미러한다. 백엔드 값이 바뀌면 이 파일도
// 함께 갱신할 것 (frontend/src/config/compos.ts와 같은 원칙).
import { WIDE_COMPOS } from "../config/compos";

export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

export const CONFIDENCE_THRESHOLD = 0.7;
export const POSE_MIN_DETECTION_CONFIDENCE = 0.5;
export const LANDMARK_VISIBILITY_THRESHOLD = 0.5;

export const SIDE_WIDTH_RATIO_THRESHOLD = 0.35;
export const LEG_SPREAD_RATIO_THRESHOLD = 1.2;
export const ARM_SPREAD_ANGLE_THRESHOLD_DEG = 45;
export const HEAD_MARGIN_FACTOR = 0.6;
// 정면/후면 판별용 코-귀 상대 깊이(z) 정규화 스케일 (backend/config.py 참고).
export const VIEW_DEPTH_CONFIDENCE_SCALE = 0.3;

export const CROP_PADDING_FACTOR = 1.1;

const FULL_COMPOS = new Set([1, 2, 7, 11, 12]);

export const CROP_RATIOS: Record<number, [number, number]> = {};
for (let num = 1; num <= 16; num++) {
  if (WIDE_COMPOS.has(num)) CROP_RATIOS[num] = [16, 9];
  else if (FULL_COMPOS.has(num)) CROP_RATIOS[num] = [3, 4];
  else CROP_RATIOS[num] = [4, 5];
}
