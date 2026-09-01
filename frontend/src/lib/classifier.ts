// backend/preprocessing/classifier.py 포팅 (오늘 세션에서 고친 최종본 기준: z-depth 기반
// 정면/후면 판별, 팔벌림 우선순위). 이미지 I/O가 없는 순수 로직이라 기계적으로 그대로 옮겼다.
import {
  ARM_SPREAD_ANGLE_THRESHOLD_DEG,
  LANDMARK_VISIBILITY_THRESHOLD,
  LEG_SPREAD_RATIO_THRESHOLD,
  SIDE_WIDTH_RATIO_THRESHOLD,
  VIEW_DEPTH_CONFIDENCE_SCALE,
} from "./preprocessConfig";
import type { Landmarks } from "./pose";

type View = "front" | "side" | "back";
type Region = "full" | "torso" | "upper" | "lower";
type Variant = "apart" | "together" | "normal" | "arms_spread" | null;

// view/region/variant 조합 -> compos_id (backend classifier.py의 _COMPOS_TABLE과 동일)
const COMPOS_TABLE: Record<string, number> = {
  "front|full|apart": 1,
  "front|full|together": 2,
  "front|torso|null": 3,
  "front|upper|normal": 4,
  "front|upper|arms_spread": 5,
  "front|lower|null": 6,
  "side|full|null": 7,
  "side|torso|null": 8,
  "side|upper|null": 9,
  "side|lower|null": 10,
  "back|full|apart": 11,
  "back|full|together": 12,
  "back|torso|null": 13,
  "back|upper|normal": 14,
  "back|upper|arms_spread": 15,
  "back|lower|null": 16,
};

function tableKey(view: string, region: string, variant: Variant): string {
  return `${view}|${region}|${variant ?? "null"}`;
}

function isVisible(landmarks: Landmarks, name: string): boolean {
  const lm = landmarks[name];
  return !!lm && lm[3] >= LANDMARK_VISIBILITY_THRESHOLD;
}

function anyVisible(landmarks: Landmarks, names: string[]): boolean {
  return names.some((n) => isVisible(landmarks, n));
}

function meanVisibility(landmarks: Landmarks, names: string[]): number {
  const values = names.filter((n) => n in landmarks).map((n) => landmarks[n][3]);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function classifyView(landmarks: Landmarks): [View, number] {
  const lSh = landmarks["LEFT_SHOULDER"];
  const rSh = landmarks["RIGHT_SHOULDER"];
  const lHip = landmarks["LEFT_HIP"];
  const rHip = landmarks["RIGHT_HIP"];
  if (!lSh || !rSh || !lHip || !rHip) return ["front", 0.0];

  const shoulderW = Math.abs(lSh[0] - rSh[0]);
  const hipW = Math.abs(lHip[0] - rHip[0]);
  const shoulderMidY = (lSh[1] + rSh[1]) / 2;
  const hipMidY = (lHip[1] + rHip[1]) / 2;
  const torsoH = Math.abs(hipMidY - shoulderMidY);
  if (torsoH < 1e-6) return ["front", 0.0];

  const widthRatio = ((shoulderW + hipW) / 2) / torsoH;
  const threshold = SIDE_WIDTH_RATIO_THRESHOLD;

  if (widthRatio < threshold) {
    return ["side", clamp01((threshold - widthRatio) / threshold)];
  }

  const nose = landmarks["NOSE"];
  const ears = [landmarks["LEFT_EAR"], landmarks["RIGHT_EAR"]].filter((p): p is [number, number, number, number] => !!p);
  if (nose && ears.length) {
    const earZ = ears.reduce((sum, e) => sum + e[2], 0) / ears.length;
    const normalizedDepth = (nose[2] - earZ) / torsoH;
    const view: View = normalizedDepth > 0 ? "back" : "front";
    return [view, clamp01(Math.abs(normalizedDepth) / VIEW_DEPTH_CONFIDENCE_SCALE)];
  }

  // z 정보를 쓸 수 없는 예외적인 경우에만 예전 방식(얼굴 랜드마크 visibility)으로 폴백
  const faceNames = ["NOSE", "LEFT_EYE", "RIGHT_EYE", "LEFT_EAR", "RIGHT_EAR"];
  const faceVis = meanVisibility(landmarks, faceNames);
  const view: View = faceVis >= LANDMARK_VISIBILITY_THRESHOLD ? "front" : "back";
  return [view, clamp01(Math.abs(faceVis - LANDMARK_VISIBILITY_THRESHOLD) / LANDMARK_VISIBILITY_THRESHOLD)];
}

function classifyRegion(landmarks: Landmarks): [Region, number] {
  const headInFrame = isVisible(landmarks, "NOSE");
  const shoulderVisible = anyVisible(landmarks, ["LEFT_SHOULDER", "RIGHT_SHOULDER"]);
  const hipVisible = anyVisible(landmarks, ["LEFT_HIP", "RIGHT_HIP"]);
  const kneeVisible = anyVisible(landmarks, ["LEFT_KNEE", "RIGHT_KNEE"]);
  const ankleVisible = anyVisible(landmarks, ["LEFT_ANKLE", "RIGHT_ANKLE"]);

  let region: Region;
  let decisiveNames: string[];

  if (shoulderVisible && hipVisible && kneeVisible && ankleVisible) {
    region = "full";
    decisiveNames = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"];
  } else if (headInFrame && shoulderVisible && hipVisible && !kneeVisible) {
    region = "upper";
    decisiveNames = ["NOSE", "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"];
  } else if (shoulderVisible && hipVisible && !headInFrame && !kneeVisible) {
    region = "torso";
    decisiveNames = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"];
  } else if (hipVisible && kneeVisible && ankleVisible && !shoulderVisible) {
    region = "lower";
    decisiveNames = ["LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"];
  } else {
    // 애매한 패턴 - 그나마 가장 가까운 카테고리로 낮은 신뢰도로 폴백
    if (shoulderVisible && hipVisible) {
      region = !kneeVisible ? "upper" : "full";
    } else if (hipVisible) {
      region = "lower";
    } else {
      region = "upper";
    }
    decisiveNames = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"];
    const conf = clamp01(meanVisibility(landmarks, decisiveNames));
    return [region, Math.min(conf, 0.4)];
  }

  const thr = LANDMARK_VISIBILITY_THRESHOLD;
  const diffs = decisiveNames.filter((n) => n in landmarks).map((n) => Math.abs(landmarks[n][3] - thr) / Math.max(thr, 1 - thr));
  const confidence = diffs.length ? clamp01(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0.0;
  return [region, confidence];
}

function classifyLegSpread(landmarks: Landmarks): [Variant, number] {
  const lAnkle = landmarks["LEFT_ANKLE"];
  const rAnkle = landmarks["RIGHT_ANKLE"];
  const lSh = landmarks["LEFT_SHOULDER"];
  const rSh = landmarks["RIGHT_SHOULDER"];
  if (!lAnkle || !rAnkle || !lSh || !rSh) return ["together", 0.0];

  const ankleDist = Math.hypot(lAnkle[0] - rAnkle[0], lAnkle[1] - rAnkle[1]);
  const shoulderW = Math.hypot(lSh[0] - rSh[0], lSh[1] - rSh[1]);
  if (shoulderW < 1e-6) return ["together", 0.0];

  const legRatio = ankleDist / shoulderW;
  const threshold = LEG_SPREAD_RATIO_THRESHOLD;
  const variant: Variant = legRatio > threshold ? "apart" : "together";
  return [variant, clamp01(Math.abs(legRatio - threshold) / threshold)];
}

function classifyArmSpread(landmarks: Landmarks): [Variant, number] {
  const sides: [string, string][] = [
    ["LEFT_SHOULDER", "LEFT_ELBOW"],
    ["RIGHT_SHOULDER", "RIGHT_ELBOW"],
  ];
  const angles: number[] = [];
  for (const [shName, elName] of sides) {
    const sh = landmarks[shName];
    const el = landmarks[elName];
    if (!sh || !el || sh[3] < LANDMARK_VISIBILITY_THRESHOLD || el[3] < LANDMARK_VISIBILITY_THRESHOLD) continue;
    const angle = (Math.atan2(el[1] - sh[1], el[0] - sh[0]) * 180) / Math.PI;
    const angleFromHorizontal = Math.min(Math.abs(angle), Math.abs(180 - Math.abs(angle)));
    angles.push(angleFromHorizontal);
  }

  if (!angles.length) return ["normal", 0.0];

  const avgAngle = angles.reduce((a, b) => a + b, 0) / angles.length;
  const threshold = ARM_SPREAD_ANGLE_THRESHOLD_DEG;
  const variant: Variant = avgAngle < threshold ? "arms_spread" : "normal";
  return [variant, clamp01(Math.abs(avgAngle - threshold) / threshold)];
}

/** 랜드마크로부터 (compos_id, confidence)를 반환. 완전히 애매한 경우에도 최선의 추정치를
 * 낮은 confidence와 함께 반환한다 (예외를 던지지 않음). */
export function classify(landmarks: Landmarks): [number, number] {
  const [view, viewConf] = classifyView(landmarks);
  const [initialRegion, regionConf] = classifyRegion(landmarks);
  let region: Region = initialRegion;

  let variant: Variant = null;
  let variantConf = 1.0;

  // 팔벌림 자세는 다리까지 보이는 전신 사진에서도 나타날 수 있다 - 팔이 뚜렷하게 벌어져
  // 있으면 원래 판별된 region과 무관하게 5/15번(상반신 팔벌림) 구도로 우선 분류한다.
  const [armVariant, armConf] = view === "front" || view === "back" ? classifyArmSpread(landmarks) : (["normal", 0.0] as [Variant, number]);
  if (armVariant === "arms_spread") {
    region = "upper";
    variant = "arms_spread";
    variantConf = armConf;
  } else if (region === "full" && (view === "front" || view === "back")) {
    [variant, variantConf] = classifyLegSpread(landmarks);
  } else if (region === "upper" && (view === "front" || view === "back")) {
    variant = armVariant;
    variantConf = armConf;
  }

  const key = tableKey(view, region, variant);
  let composId = COMPOS_TABLE[key];
  if (composId === undefined) {
    // 조합이 테이블에 없으면(예: 측면+전신+variant처럼 정의되지 않은 조합) region/view만으로 재시도
    const fallbackKey = tableKey(view, region, null);
    composId = COMPOS_TABLE[fallbackKey] ?? 1;
    variantConf = Math.min(variantConf, 0.3);
  }

  const confidence = clamp01(viewConf * regionConf * variantConf);
  return [composId, confidence];
}
