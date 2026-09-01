// backend/preprocessing/cropper.py 포팅 (오늘 세션에서 고친 최종본 기준: 낮은 visibility
// 랜드마크는 앵커점에서 제외해 회전 여백(검은 영역)이 크롭되는 버그를 막은 버전).
import { WIDE_COMPOS } from "../config/compos";
import { getRotatedCanvasSize, renderRotatedImage } from "../utils/imageRotation";
import { CROP_PADDING_FACTOR, CROP_RATIOS, HEAD_MARGIN_FACTOR, LANDMARK_VISIBILITY_THRESHOLD } from "./preprocessConfig";
import { transformLandmarks, type LandmarksPx } from "./leveler";
import type { CropBox } from "../api/types";
import type { Landmarks } from "./pose";

type Point = [number, number];

const FULL_COMPOS = new Set([1, 2, 7, 11, 12]);
const TORSO_COMPOS = new Set([3, 8, 13]);
const UPPER_COMPOS = new Set([4, 5, 9, 14, 15]);
const LOWER_COMPOS = new Set([6, 10, 16]);

function categoryFor(composId: number): "full" | "torso" | "upper" | "lower" {
  if (FULL_COMPOS.has(composId)) return "full";
  if (TORSO_COMPOS.has(composId)) return "torso";
  if (UPPER_COMPOS.has(composId)) return "upper";
  if (LOWER_COMPOS.has(composId)) return "lower";
  return "full";
}

/** visibility가 임계값 미만인 랜드마크(가려져서 대략 찍힌 좌표)는 앵커점에서 제외한다. */
function visible(landmarksPx: LandmarksPx, name: string): Point | null {
  const p = landmarksPx[name];
  if (!p || p[2] < LANDMARK_VISIBILITY_THRESHOLD) return null;
  return [p[0], p[1]];
}

function estimateHeadTopY(landmarksPx: LandmarksPx): number | null {
  const nose = visible(landmarksPx, "NOSE");
  if (!nose) return null;
  const shoulders = [visible(landmarksPx, "LEFT_SHOULDER"), visible(landmarksPx, "RIGHT_SHOULDER")].filter(
    (p): p is Point => !!p,
  );
  if (!shoulders.length) return nose[1];
  const shoulderMidY = shoulders.reduce((sum, p) => sum + p[1], 0) / shoulders.length;
  return nose[1] - (shoulderMidY - nose[1]) * HEAD_MARGIN_FACTOR;
}

function collectAnchorPoints(landmarksPx: LandmarksPx, composId: number): Point[] {
  const category = categoryFor(composId);
  const wide = WIDE_COMPOS.has(composId);
  const points: Point[] = [];

  if (category === "full" || category === "upper" || category === "torso") {
    for (const name of ["LEFT_SHOULDER", "RIGHT_SHOULDER"]) {
      const p = visible(landmarksPx, name);
      if (p) points.push(p);
    }
  }

  if (category === "full" || category === "upper") {
    const headTopY = estimateHeadTopY(landmarksPx);
    if (headTopY !== null) {
      const nose = visible(landmarksPx, "NOSE");
      const headX = nose ? nose[0] : points.length ? points[0][0] : null;
      if (headX !== null) points.push([headX, headTopY]);
    }
  }

  if (category === "full" || category === "lower") {
    for (const name of [
      "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
      "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
    ]) {
      const p = visible(landmarksPx, name);
      if (p) points.push(p);
    }
  } else if (category === "upper" || category === "torso") {
    for (const name of ["LEFT_HIP", "RIGHT_HIP"]) {
      const p = visible(landmarksPx, name);
      if (p) points.push(p);
    }
  }

  if (category === "upper" && wide) {
    for (const name of ["LEFT_WRIST", "RIGHT_WRIST", "LEFT_ELBOW", "RIGHT_ELBOW"]) {
      const p = visible(landmarksPx, name);
      if (p) points.push(p);
    }
  }

  return points;
}

function centerAndClamp(cx: number, cy: number, cropW: number, cropH: number, imgW: number, imgH: number): CropBox {
  if (cropW > imgW || cropH > imgH) {
    const scale = Math.min(imgW / cropW, imgH / cropH);
    cropW *= scale;
    cropH *= scale;
  }

  let x0 = cx - cropW / 2;
  let y0 = cy - cropH / 2;
  let x1 = x0 + cropW;
  let y1 = y0 + cropH;

  if (x0 < 0) { x1 -= x0; x0 = 0; }
  if (y0 < 0) { y1 -= y0; y0 = 0; }
  if (x1 > imgW) { x0 -= x1 - imgW; x1 = imgW; }
  if (y1 > imgH) { y0 -= y1 - imgH; y1 = imgH; }

  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);

  return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
}

function fallbackBox(imgW: number, imgH: number, ratioW: number, ratioH: number): CropBox {
  const targetRatio = ratioW / ratioH;
  let cropW: number;
  let cropH: number;
  if (imgW / targetRatio <= imgH) {
    cropW = imgW;
    cropH = imgW / targetRatio;
  } else {
    cropH = imgH;
    cropW = imgH * targetRatio;
  }
  return centerAndClamp(imgW / 2, imgH / 2, cropW, cropH, imgW, imgH);
}

/** 랜드마크(회전 후 이미지의 픽셀 좌표) 기반 AI 1차 크롭박스 계산. 앵커 랜드마크가 부족해도
 * 예외를 던지지 않고 항상 사용 가능한 제안값을 반환한다. */
export function computeCropBox(landmarksPx: LandmarksPx, rotatedW: number, rotatedH: number, composId: number): CropBox {
  const [ratioW, ratioH] = CROP_RATIOS[composId] ?? [3, 4];
  const points = collectAnchorPoints(landmarksPx, composId);

  if (!points.length) return fallbackBox(rotatedW, rotatedH, ratioW, ratioH);

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  let bboxW = x1 - x0;
  const bboxH = y1 - y0;

  if (bboxW <= 0 || bboxH <= 0) return fallbackBox(rotatedW, rotatedH, ratioW, ratioH);

  const sideMargin = bboxW * 0.08;
  x0 -= sideMargin;
  x1 += sideMargin;
  bboxW = x1 - x0;

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const targetRatio = ratioW / ratioH;
  let cropW: number;
  let cropH: number;
  if (bboxW / targetRatio >= bboxH) {
    cropW = bboxW;
    cropH = bboxW / targetRatio;
  } else {
    cropH = bboxH;
    cropW = bboxH * targetRatio;
  }

  cropW *= CROP_PADDING_FACTOR;
  cropH *= CROP_PADDING_FACTOR;

  return centerAndClamp(cx, cy, cropW, cropH, rotatedW, rotatedH);
}

/** 편의 함수: 원본 랜드마크 + 회전각으로부터 회전 후 이미지 기준 crop_box를 바로 계산. */
export function proposeCropBox(img: HTMLImageElement, landmarks: Landmarks, rotationDeg: number, composId: number): CropBox {
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  const { width: rotatedW, height: rotatedH } = getRotatedCanvasSize(origW, origH, rotationDeg);
  const landmarksPx = transformLandmarks(landmarks, origW, origH, rotationDeg, rotatedW, rotatedH);
  return computeCropBox(landmarksPx, rotatedW, rotatedH, composId);
}

export interface CroppedImage {
  dataUrl: string; // "data:image/jpeg;base64,..." - pptxgenjs addImage({data})에 바로 사용
  width: number;
  height: number;
}

/** 원본을 회전 후 crop_box로 잘라 반환한다 (PPT 생성 직전에만 호출 - 비파괴 원칙, 원본 Blob은
 * 절대 건드리지 않음). crop_box가 (0,0,0,0) 등 비정상이면 구도 비율에 맞춘 안전한 기본값으로
 * 대체한다. */
export function exportCroppedImage(img: HTMLImageElement, rotationDeg: number, cropBox: CropBox, composId = 1): CroppedImage {
  const rotated = renderRotatedImage(img, rotationDeg);
  let [x0, y0, x1, y1] = cropBox;
  if (x1 <= x0 || y1 <= y0) {
    const [ratioW, ratioH] = CROP_RATIOS[composId] ?? [3, 4];
    [x0, y0, x1, y1] = fallbackBox(rotated.width, rotated.height, ratioW, ratioH);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(rotated, x0, y0, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL("image/jpeg", 0.95), width: w, height: h };
}
