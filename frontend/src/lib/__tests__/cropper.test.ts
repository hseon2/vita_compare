// backend/tests/test_cropper.py의 compute_crop_box 관련 테스트 포팅 (합성 랜드마크로 비율/
// 중앙정렬/클램프를 검증). exportCroppedImage는 실제 Canvas/Image가 필요해 여기서는 다루지
// 않고 브라우저 E2E 검증으로 확인한다.
import { describe, expect, it } from "vitest";
import { computeCropBox } from "../cropper";
import { CROP_RATIOS } from "../preprocessConfig";
import type { LandmarksPx } from "../leveler";

const IMG_W = 800;
const IMG_H = 1000;

function fullBodyLandmarks(cx = 400): LandmarksPx {
  return {
    NOSE: [cx, 100, 1.0],
    LEFT_SHOULDER: [cx - 60, 180, 1.0], RIGHT_SHOULDER: [cx + 60, 180, 1.0],
    LEFT_HIP: [cx - 50, 500, 1.0], RIGHT_HIP: [cx + 50, 500, 1.0],
    LEFT_KNEE: [cx - 45, 700, 1.0], RIGHT_KNEE: [cx + 45, 700, 1.0],
    LEFT_ANKLE: [cx - 40, 900, 1.0], RIGHT_ANKLE: [cx + 40, 900, 1.0],
    LEFT_FOOT_INDEX: [cx - 40, 950, 1.0], RIGHT_FOOT_INDEX: [cx + 40, 950, 1.0],
  };
}

function upperBodyLandmarks(wide: boolean, cx = 400): LandmarksPx {
  const base: LandmarksPx = {
    NOSE: [cx, 150, 1.0],
    LEFT_SHOULDER: [cx - 70, 250, 1.0], RIGHT_SHOULDER: [cx + 70, 250, 1.0],
    LEFT_HIP: [cx - 60, 600, 1.0], RIGHT_HIP: [cx + 60, 600, 1.0],
  };
  if (wide) {
    base.LEFT_ELBOW = [cx - 200, 260, 1.0];
    base.RIGHT_ELBOW = [cx + 200, 260, 1.0];
    base.LEFT_WRIST = [cx - 320, 265, 1.0];
    base.RIGHT_WRIST = [cx + 320, 265, 1.0];
  }
  return base;
}

function torsoLandmarks(cx = 400): LandmarksPx {
  return {
    LEFT_SHOULDER: [cx - 65, 100, 1.0], RIGHT_SHOULDER: [cx + 65, 100, 1.0],
    LEFT_HIP: [cx - 55, 400, 1.0], RIGHT_HIP: [cx + 55, 400, 1.0],
  };
}

function lowerBodyLandmarks(cx = 400): LandmarksPx {
  return {
    LEFT_HIP: [cx - 55, 100, 1.0], RIGHT_HIP: [cx + 55, 100, 1.0],
    LEFT_KNEE: [cx - 45, 400, 1.0], RIGHT_KNEE: [cx + 45, 400, 1.0],
    LEFT_ANKLE: [cx - 40, 700, 1.0], RIGHT_ANKLE: [cx + 40, 700, 1.0],
  };
}

function aspect([x0, y0, x1, y1]: [number, number, number, number]): number {
  return (x1 - x0) / (y1 - y0);
}

describe("computeCropBox", () => {
  it("full body ratio matches config", () => {
    const box = computeCropBox(fullBodyLandmarks(), IMG_W, IMG_H, 1);
    const target = CROP_RATIOS[1][0] / CROP_RATIOS[1][1];
    expect(Math.abs(aspect(box) - target)).toBeLessThan(0.02);
  });

  it("torso ratio matches config", () => {
    const box = computeCropBox(torsoLandmarks(), IMG_W, IMG_H, 3);
    const target = CROP_RATIOS[3][0] / CROP_RATIOS[3][1];
    expect(Math.abs(aspect(box) - target)).toBeLessThan(0.02);
  });

  it("lower body ratio matches config", () => {
    const box = computeCropBox(lowerBodyLandmarks(), IMG_W, IMG_H, 6);
    const target = CROP_RATIOS[6][0] / CROP_RATIOS[6][1];
    expect(Math.abs(aspect(box) - target)).toBeLessThan(0.02);
  });

  it("upper normal ratio matches config", () => {
    const box = computeCropBox(upperBodyLandmarks(false), IMG_W, IMG_H, 4);
    const target = CROP_RATIOS[4][0] / CROP_RATIOS[4][1];
    expect(Math.abs(aspect(box) - target)).toBeLessThan(0.02);
  });

  it("wide compos ratio is 16:9 and wider than normal upper", () => {
    const wideBox = computeCropBox(upperBodyLandmarks(true), IMG_W, IMG_H, 5);
    const target = CROP_RATIOS[5][0] / CROP_RATIOS[5][1];
    expect(Math.abs(aspect(wideBox) - target)).toBeLessThan(0.02);
    expect(CROP_RATIOS[5]).toEqual([16, 9]);
  });

  it("box is centered on bbox center", () => {
    const box = computeCropBox(fullBodyLandmarks(400), IMG_W, IMG_H, 1);
    const [x0, , x1] = box;
    const boxCx = (x0 + x1) / 2;
    expect(Math.abs(boxCx - 400)).toBeLessThan(15);
  });

  it("clamps within image bounds near edge", () => {
    const box = computeCropBox(fullBodyLandmarks(50), IMG_W, IMG_H, 1);
    const [x0, y0, x1, y1] = box;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(IMG_W);
    expect(y1).toBeLessThanOrEqual(IMG_H);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
  });

  it("regression: low-visibility outlier landmark is ignored", () => {
    const landmarks = fullBodyLandmarks(400);
    const withOutlier = { ...landmarks, RIGHT_ANKLE: [440, 5000, 0.05] as [number, number, number] };

    const cleanBox = computeCropBox(landmarks, IMG_W, IMG_H, 1);
    const outlierBox = computeCropBox(withOutlier, IMG_W, IMG_H, 1);
    expect(outlierBox).toEqual(cleanBox);
  });

  it("no landmarks falls back to full-image ratio box", () => {
    const box = computeCropBox({}, IMG_W, IMG_H, 1);
    const [x0, y0, x1, y1] = box;
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    const target = CROP_RATIOS[1][0] / CROP_RATIOS[1][1];
    expect(Math.abs(aspect(box) - target)).toBeLessThan(0.02);
  });
});
