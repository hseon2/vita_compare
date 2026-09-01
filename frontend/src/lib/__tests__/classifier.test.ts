// backend/tests/test_classifier.py 포팅. 합성 랜드마크로 분류 로직/임계값의 자기일관성만
// 검증한다. 정면/후면 판별은 코-귀 상대 깊이(z)로 하므로 아래 테스트들도 z값으로 방향을 표현한다.
import { describe, expect, it } from "vitest";
import { classify } from "../classifier";
import type { Landmarks } from "../pose";

function lm(x: number, y: number, opts: { v?: number; z?: number } = {}): [number, number, number, number] {
  return [x, y, opts.z ?? 0.0, opts.v ?? 1.0];
}

// 실사진 실측(front≈-0.61/-0.32, back≈0.21/-0.07, nose/ear z)을 단순화해 부호와 상대적 크기만
// 맞춘 합성값.
function frontFace(cx = 0.5, cy = 0.1): Landmarks {
  return {
    NOSE: lm(cx, cy, { z: -0.3 }),
    LEFT_EYE: lm(cx + 0.02, cy - 0.01, { z: -0.28 }),
    RIGHT_EYE: lm(cx - 0.02, cy - 0.01, { z: -0.28 }),
    LEFT_EAR: lm(cx + 0.05, cy, { z: -0.1 }),
    RIGHT_EAR: lm(cx - 0.05, cy, { z: -0.1 }),
  };
}

function backFace(cx = 0.5, cy = 0.1): Landmarks {
  return {
    NOSE: lm(cx, cy, { z: 0.2 }),
    LEFT_EYE: lm(cx + 0.02, cy - 0.01, { z: 0.18 }),
    RIGHT_EYE: lm(cx - 0.02, cy - 0.01, { z: 0.18 }),
    LEFT_EAR: lm(cx + 0.05, cy, { z: -0.05 }),
    RIGHT_EAR: lm(cx - 0.05, cy, { z: -0.05 }),
  };
}

describe("classify", () => {
  it("front full legs apart is compos 1", () => {
    const landmarks: Landmarks = {
      ...frontFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_KNEE: lm(0.6, 0.75), RIGHT_KNEE: lm(0.4, 0.75),
      LEFT_ANKLE: lm(0.69, 0.95), RIGHT_ANKLE: lm(0.31, 0.95),
      LEFT_FOOT_INDEX: lm(0.7, 0.98), RIGHT_FOOT_INDEX: lm(0.3, 0.98),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(1);
    expect(confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("front full legs together is compos 2", () => {
    const landmarks: Landmarks = {
      ...frontFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_KNEE: lm(0.51, 0.75), RIGHT_KNEE: lm(0.49, 0.75),
      LEFT_ANKLE: lm(0.508, 0.95), RIGHT_ANKLE: lm(0.492, 0.95),
      LEFT_FOOT_INDEX: lm(0.51, 0.98), RIGHT_FOOT_INDEX: lm(0.49, 0.98),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(2);
    expect(confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("back full legs apart is compos 11 (코가 귀보다 카메라에서 멀면 후면)", () => {
    const landmarks: Landmarks = {
      ...backFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_KNEE: lm(0.6, 0.75), RIGHT_KNEE: lm(0.4, 0.75),
      LEFT_ANKLE: lm(0.69, 0.95), RIGHT_ANKLE: lm(0.31, 0.95),
      LEFT_FOOT_INDEX: lm(0.7, 0.98), RIGHT_FOOT_INDEX: lm(0.3, 0.98),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(11);
    expect(confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("side full is compos 7", () => {
    const landmarks: Landmarks = {
      LEFT_SHOULDER: lm(0.51, 0.2), RIGHT_SHOULDER: lm(0.48, 0.2),
      LEFT_HIP: lm(0.505, 0.55), RIGHT_HIP: lm(0.475, 0.55),
      LEFT_KNEE: lm(0.5, 0.75), RIGHT_KNEE: lm(0.48, 0.75),
      LEFT_ANKLE: lm(0.5, 0.95), RIGHT_ANKLE: lm(0.48, 0.95),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(7);
    expect(confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("front torso is compos 3 (머리가 프레임 밖)", () => {
    const landmarks: Landmarks = {
      NOSE: lm(0.5, -0.05, { v: 0.4 }),
      LEFT_EYE: lm(0.52, -0.06, { v: 0.9 }), RIGHT_EYE: lm(0.48, -0.06, { v: 0.9 }),
      LEFT_EAR: lm(0.55, -0.05, { v: 0.9 }), RIGHT_EAR: lm(0.45, -0.05, { v: 0.9 }),
      LEFT_SHOULDER: lm(0.58, 0.1), RIGHT_SHOULDER: lm(0.42, 0.1),
      LEFT_HIP: lm(0.56, 0.45), RIGHT_HIP: lm(0.44, 0.45),
    };
    const [composId] = classify(landmarks);
    expect(composId).toBe(3);
  });

  it("front upper normal is compos 4", () => {
    const landmarks: Landmarks = {
      ...frontFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_ELBOW: lm(0.6, 0.35), RIGHT_ELBOW: lm(0.4, 0.35),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(4);
    expect(confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("front upper arms spread is compos 5", () => {
    const landmarks: Landmarks = {
      ...frontFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_ELBOW: lm(0.85, 0.22), RIGHT_ELBOW: lm(0.15, 0.22),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(5);
    expect(confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("back upper arms spread is compos 15", () => {
    const landmarks: Landmarks = {
      ...backFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_ELBOW: lm(0.85, 0.22), RIGHT_ELBOW: lm(0.15, 0.22),
    };
    const [composId] = classify(landmarks);
    expect(composId).toBe(15);
  });

  it("lower body only returns a valid compos with low confidence", () => {
    const landmarks: Landmarks = {
      LEFT_HIP: lm(0.56, 0.1), RIGHT_HIP: lm(0.44, 0.1),
      LEFT_KNEE: lm(0.55, 0.4), RIGHT_KNEE: lm(0.45, 0.4),
      LEFT_ANKLE: lm(0.54, 0.7), RIGHT_ANKLE: lm(0.46, 0.7),
    };
    const [composId, confidence] = classify(landmarks);
    expect([6, 16]).toContain(composId);
    expect(confidence).toBeLessThan(0.7);
  });

  it("borderline leg spread yields low confidence", () => {
    const landmarks: Landmarks = {
      ...frontFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_KNEE: lm(0.57, 0.75), RIGHT_KNEE: lm(0.43, 0.75),
      LEFT_ANKLE: lm(0.596, 0.95), RIGHT_ANKLE: lm(0.404, 0.95),
      LEFT_FOOT_INDEX: lm(0.6, 0.98), RIGHT_FOOT_INDEX: lm(0.4, 0.98),
    };
    const [composId, confidence] = classify(landmarks);
    expect([1, 2]).toContain(composId);
    expect(confidence).toBeLessThan(0.7);
  });

  it("regression: back view with high face-landmark visibility is still classified as back", () => {
    // 실사진 실측값과 동일하게 얼굴 랜드마크 visibility는 모두 높다(뒷모습인데도) - visibility
    // 기반 판별이었다면 무조건 정면으로 오판했을 케이스.
    const landmarks: Landmarks = {
      NOSE: lm(0.5, 0.1, { v: 0.999, z: 0.2 }),
      LEFT_EYE: lm(0.52, 0.09, { v: 0.999, z: 0.18 }), RIGHT_EYE: lm(0.48, 0.09, { v: 0.999, z: 0.18 }),
      LEFT_EAR: lm(0.55, 0.1, { v: 0.999, z: -0.05 }), RIGHT_EAR: lm(0.45, 0.1, { v: 0.999, z: -0.05 }),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_KNEE: lm(0.51, 0.75), RIGHT_KNEE: lm(0.49, 0.75),
      LEFT_ANKLE: lm(0.508, 0.95), RIGHT_ANKLE: lm(0.492, 0.95),
      LEFT_FOOT_INDEX: lm(0.51, 0.98), RIGHT_FOOT_INDEX: lm(0.49, 0.98),
    };
    const [composId] = classify(landmarks);
    expect(composId).toBe(12); // back, full, legs together
  });

  it("regression: full-body arm spread is still classified as wide compos (5)", () => {
    const landmarks: Landmarks = {
      ...frontFace(),
      LEFT_SHOULDER: lm(0.58, 0.2), RIGHT_SHOULDER: lm(0.42, 0.2),
      LEFT_ELBOW: lm(0.85, 0.22), RIGHT_ELBOW: lm(0.15, 0.22),
      LEFT_HIP: lm(0.56, 0.55), RIGHT_HIP: lm(0.44, 0.55),
      LEFT_KNEE: lm(0.51, 0.75), RIGHT_KNEE: lm(0.49, 0.75),
      LEFT_ANKLE: lm(0.508, 0.95), RIGHT_ANKLE: lm(0.492, 0.95),
      LEFT_FOOT_INDEX: lm(0.51, 0.98), RIGHT_FOOT_INDEX: lm(0.49, 0.98),
    };
    const [composId, confidence] = classify(landmarks);
    expect(composId).toBe(5);
    expect(confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("empty landmarks never throws", () => {
    const [composId, confidence] = classify({});
    expect(Number.isInteger(composId)).toBe(true);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});
