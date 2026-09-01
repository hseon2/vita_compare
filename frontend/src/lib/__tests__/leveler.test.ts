// backend/preprocessing/leveler.py의 compute_rotation_angle 포팅 검증 (순수 삼각함수라
// 이미지 없이 테스트 가능). transform_landmarks의 픽셀 단위 정확도는 imageRotation.ts의
// renderRotatedImage가 이미 이번 세션에서 PIL과 대조 검증된 매트릭스를 그대로 쓰므로
// 여기서는 다루지 않는다.
import { describe, expect, it } from "vitest";
import { computeRotationAngle } from "../leveler";
import type { Landmarks } from "../pose";

function lm(x: number, y: number, v = 1.0): [number, number, number, number] {
  return [x, y, 0, v];
}

describe("computeRotationAngle", () => {
  it("returns 0 when shoulders are perfectly level", () => {
    const landmarks: Landmarks = {
      LEFT_SHOULDER: lm(0.6, 0.3),
      RIGHT_SHOULDER: lm(0.4, 0.3),
    };
    expect(computeRotationAngle(landmarks, 1000, 1000)).toBeCloseTo(0, 5);
  });

  it("returns a positive angle when the right shoulder is higher (tilted)", () => {
    // 이미지 좌표 기준 오른쪽(작은 x)이 더 위(작은 y)로 - 화면이 기울어진 상태
    const landmarks: Landmarks = {
      LEFT_SHOULDER: lm(0.6, 0.32),
      RIGHT_SHOULDER: lm(0.4, 0.28),
    };
    const angle = computeRotationAngle(landmarks, 1000, 1000);
    expect(angle).toBeGreaterThan(0);
  });

  it("falls back to eye line when shoulders are low-visibility", () => {
    const landmarks: Landmarks = {
      LEFT_SHOULDER: lm(0.6, 0.35, 0.1),
      RIGHT_SHOULDER: lm(0.4, 0.3, 0.1),
      LEFT_EYE: lm(0.55, 0.1),
      RIGHT_EYE: lm(0.45, 0.1),
    };
    expect(computeRotationAngle(landmarks, 1000, 1000)).toBeCloseTo(0, 5);
  });

  it("returns 0 when no usable landmarks are present", () => {
    expect(computeRotationAngle({}, 1000, 1000)).toBe(0);
  });
});
