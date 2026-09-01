// backend/preprocessing/leveler.py의 compute_rotation_angle/transform_landmarks 포팅.
// apply_rotation(캔버스 회전)은 이미 frontend/src/utils/imageRotation.ts의
// renderRotatedImage/getRotatedCanvasSize로 포팅되어 있으므로(PIL 회전과 픽셀 단위로 검증된
// 매트릭스) 여기서는 다시 만들지 않고 그대로 재사용한다.
import { LANDMARK_VISIBILITY_THRESHOLD } from "./preprocessConfig";
import type { Landmarks } from "./pose";

function orderByImageX(p1: [number, number, number, number], p2: [number, number, number, number]) {
  return p1[0] <= p2[0] ? [p1, p2] : [p2, p1];
}

/** 어깨 라인(우선) 또는 눈 라인 기울기로부터 보정 회전각(도)을 계산. */
export function computeRotationAngle(landmarks: Landmarks, imageW: number, imageH: number): number {
  const leftShoulder = landmarks["LEFT_SHOULDER"];
  const rightShoulder = landmarks["RIGHT_SHOULDER"];
  const useShoulders =
    !!leftShoulder && !!rightShoulder && leftShoulder[3] >= LANDMARK_VISIBILITY_THRESHOLD && rightShoulder[3] >= LANDMARK_VISIBILITY_THRESHOLD;

  const [p1, p2] = useShoulders ? [leftShoulder, rightShoulder] : [landmarks["LEFT_EYE"], landmarks["RIGHT_EYE"]];
  if (!p1 || !p2) return 0.0;

  const [leftPt, rightPt] = orderByImageX(p1, p2);
  const dx = (rightPt[0] - leftPt[0]) * imageW;
  const dy = (rightPt[1] - leftPt[1]) * imageH;
  if (dx === 0 && dy === 0) return 0.0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export type LandmarksPx = Record<string, [number, number, number]>; // x, y, visibility (회전 후 픽셀 좌표)

/** 정규화된 원본 랜드마크를 회전 후 이미지의 픽셀 좌표(x, y, visibility)로 변환. */
export function transformLandmarks(
  landmarks: Landmarks,
  origW: number,
  origH: number,
  rotationDeg: number,
  rotatedW: number,
  rotatedH: number,
): LandmarksPx {
  const theta = (rotationDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const origCx = origW / 2;
  const origCy = origH / 2;
  const newCx = rotatedW / 2;
  const newCy = rotatedH / 2;

  const result: LandmarksPx = {};
  for (const [name, [x, y, , v]] of Object.entries(landmarks)) {
    const px = x * origW;
    const py = y * origH;
    const rx = px - origCx;
    const ry = py - origCy;
    const nx = rx * cosT + ry * sinT;
    const ny = -rx * sinT + ry * cosT;
    result[name] = [nx + newCx, ny + newCy, v];
  }
  return result;
}
