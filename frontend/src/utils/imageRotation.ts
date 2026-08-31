// backend/preprocessing/leveler.py의 apply_rotation()/transform_landmarks()과 짝을 이루는
// 클라이언트 측 회전 렌더링. PIL의 Image.rotate(angle, expand=True)는 아래 매트릭스로
// 실측 검증되었다 (backend 개발 중 PIL 실제 출력과 픽셀 단위로 대조):
//   rx = px - origCx, ry = py - origCy   (원본 중심 기준 상대좌표)
//   x' = rx*cos(theta) + ry*sin(theta) + newCx
//   y' = -rx*sin(theta) + ry*cos(theta) + newCy
// 이는 canvas의 기본 rotate(angle) 매트릭스(x'=x cosθ - y sinθ, y'=x sinθ + y cosθ)에서
// 각도를 반전(-angle)한 것과 동일하다. 따라서 canvas에서는 ctx.rotate(-radians(rotationDeg))를
// 사용해야 PIL과 같은 방향으로 회전한다. (프론트 canvas 렌더링은 PIL과 별도 구현이라
// 픽셀 단위로 100% 동일하지는 않을 수 있음 - 브라우저 수동 QA로 최종 확인 필요.)

export interface RotatedSize {
  width: number;
  height: number;
}

export function getRotatedCanvasSize(
  naturalW: number,
  naturalH: number,
  rotationDeg: number,
): RotatedSize {
  const theta = (rotationDeg * Math.PI) / 180;
  const width = Math.ceil(Math.abs(naturalW * Math.cos(theta)) + Math.abs(naturalH * Math.sin(theta)));
  const height = Math.ceil(Math.abs(naturalW * Math.sin(theta)) + Math.abs(naturalH * Math.cos(theta)));
  return { width, height };
}

/** 원본 이미지를 rotationDeg만큼 회전해 그린 새 canvas를 반환. 원본 <img>는 건드리지 않음. */
export function renderRotatedImage(
  img: HTMLImageElement,
  rotationDeg: number,
): HTMLCanvasElement {
  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;
  const { width, height } = getRotatedCanvasSize(naturalW, naturalH, rotationDeg);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  if (rotationDeg === 0) {
    ctx.drawImage(img, (width - naturalW) / 2, (height - naturalH) / 2);
    return canvas;
  }

  const theta = (-rotationDeg * Math.PI) / 180; // PIL과 같은 방향이 되도록 부호 반전
  ctx.translate(width / 2, height / 2);
  ctx.rotate(theta);
  ctx.drawImage(img, -naturalW / 2, -naturalH / 2);
  return canvas;
}
