// backend/ppt_generator/generate_ppt.py의 add_photo_slide 레이아웃 수식을 순수 함수로 뽑아둔
// 것. lib/pptGenerator.ts(실제 PPT 생성)와 components/PptSlidePreview.tsx(크롭 화면의 실시간
// 미리보기)가 이 함수 하나를 같이 써서 "미리보기가 실제 PPT와 완전히 동일하다"를 보장한다 -
// 로직을 두 군데에 복붙하면 하나만 고치고 잊어버리는 순간 둘이 어긋난다.
export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

export interface FitSize {
  w: number;
  h: number;
}

export function fitBox(imgW: number, imgH: number, boxW: number, boxH: number): FitSize {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { w: imgW * scale, h: imgH * scale };
}

export interface PlacedPhoto extends FitSize {
  x: number;
  y: number;
}

export interface PhotoSlideLayout {
  before: PlacedPhoto;
  after: PlacedPhoto;
}

/** 자동으로 맞춘 크기(placed)를 중심은 그대로 둔 채 scale배로 줄인다 - 크롭 화면에서 사용자가
 * "PPT 이미지 크기"를 줄이면 슬라이드 안에서 제자리에 작게 표시되게 한다(1.0=기존 자동 맞춤). */
function scaleAroundCenter(p: PlacedPhoto, scale: number): PlacedPhoto {
  if (scale === 1) return p;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const w = p.w * scale;
  const h = p.h * scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** wide=false: 실제 렌더 크기끼리 딱 붙여서 중앙 배치 (박스 안에서 비율유지만 하면 세로형
 * 사진 특성상 양옆 여백이 커져 사진 사이가 떨어져 보임). wide=true(5·15번 팔벌림): 대각선
 * 배치 - 전 사진은 좌측상단, 후 사진은 우측하단.
 * beforeScale/afterScale: 자동으로 꽉 채운 크기에서 각각 이 배율만큼 더 줄인다(기본 1 = 그대로). */
export function computePhotoSlideLayout(
  beforeSize: { width: number; height: number },
  afterSize: { width: number; height: number },
  wide: boolean,
  showDates: boolean,
  beforeScale = 1,
  afterScale = 1,
): PhotoSlideLayout {
  // 사진이 더 크게 꽉 차게 들어갔으면 좋겠다는 피드백 반영 - 좌측상단 구도 태그(y 0.2~0.7in)와
  // 겹치지 않는 선에서 여백을 최대한 줄였다.
  const topMargin = 0.8;
  const bottomMargin = showDates ? 0.65 : 0.3;
  const sideMargin = 0.35;
  const gap = 0.15;

  const availW = SLIDE_W - sideMargin * 2;
  const availH = SLIDE_H - topMargin - bottomMargin;

  if (wide) {
    const diagBoxW = availW * 0.52;
    const diagBoxH = availH * 0.72;
    const b = fitBox(beforeSize.width, beforeSize.height, diagBoxW, diagBoxH);
    const a = fitBox(afterSize.width, afterSize.height, diagBoxW, diagBoxH);
    return {
      before: scaleAroundCenter({ x: sideMargin, y: topMargin, ...b }, beforeScale),
      after: scaleAroundCenter({ x: sideMargin + availW - a.w, y: topMargin + availH - a.h, ...a }, afterScale),
    };
  }

  let b = fitBox(beforeSize.width, beforeSize.height, availW, availH);
  let a = fitBox(afterSize.width, afterSize.height, availW, availH);
  let totalW = b.w + gap + a.w;
  if (totalW > availW) {
    const scale = availW / totalW;
    b = { w: b.w * scale, h: b.h * scale };
    a = { w: a.w * scale, h: a.h * scale };
    totalW = b.w + gap + a.w;
  }

  const startX = sideMargin + (availW - totalW) / 2;
  const beforeY = topMargin + (availH - b.h) / 2;
  const afterY = topMargin + (availH - a.h) / 2;

  return {
    before: scaleAroundCenter({ x: startX, y: beforeY, ...b }, beforeScale),
    after: scaleAroundCenter({ x: startX + b.w + gap, y: afterY, ...a }, afterScale),
  };
}
