// 랜드마크 기반 자동 크롭 제안은 제거됐다 - 기본 크롭박스는 항상 "이미지 전체를 구도 비율에
// 맞춰 중앙 크롭"이다. 이 규칙(비율/중앙정렬/클램프)만 검증한다.
import { describe, expect, it } from "vitest";
import { defaultCropBox } from "../cropper";
import { CROP_RATIOS } from "../preprocessConfig";

const IMG_W = 800;
const IMG_H = 1000;

function aspect([x0, y0, x1, y1]: [number, number, number, number]): number {
  return (x1 - x0) / (y1 - y0);
}

describe("defaultCropBox", () => {
  it("full-body(3:4) 비율에 맞춘 박스를 만든다", () => {
    const [ratioW, ratioH] = CROP_RATIOS[1];
    const box = defaultCropBox(IMG_W, IMG_H, ratioW, ratioH);
    expect(Math.abs(aspect(box) - ratioW / ratioH)).toBeLessThan(0.01);
  });

  it("torso(4:5) 비율에 맞춘 박스를 만든다", () => {
    const [ratioW, ratioH] = CROP_RATIOS[3];
    const box = defaultCropBox(IMG_W, IMG_H, ratioW, ratioH);
    expect(Math.abs(aspect(box) - ratioW / ratioH)).toBeLessThan(0.01);
  });

  it("wide compos(16:9) 비율에 맞춘 박스를 만든다", () => {
    expect(CROP_RATIOS[5]).toEqual([16, 9]);
    const [ratioW, ratioH] = CROP_RATIOS[5];
    const box = defaultCropBox(IMG_W, IMG_H, ratioW, ratioH);
    expect(Math.abs(aspect(box) - ratioW / ratioH)).toBeLessThan(0.01);
  });

  it("이미지 정중앙을 기준으로 크롭한다", () => {
    const box = defaultCropBox(IMG_W, IMG_H, 3, 4);
    const [x0, y0, x1, y1] = box;
    expect((x0 + x1) / 2).toBeCloseTo(IMG_W / 2, 0);
    expect((y0 + y1) / 2).toBeCloseTo(IMG_H / 2, 0);
  });

  it("항상 이미지 범위 안으로 클램프된다", () => {
    const box = defaultCropBox(IMG_W, IMG_H, 16, 9);
    const [x0, y0, x1, y1] = box;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(IMG_W);
    expect(y1).toBeLessThanOrEqual(IMG_H);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
  });
});
