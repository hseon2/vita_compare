import type { CropBox } from "../api/types";
import type { PixelCrop } from "react-image-crop";

/** react-image-crop이 보고하는 "화면에 표시된" px 좌표를 회전캔버스의 실제(natural) px로 변환. */
export function displayedToNaturalBox(
  displayed: PixelCrop,
  displayedWidth: number,
  naturalWidth: number,
): CropBox {
  const scale = naturalWidth / displayedWidth;
  const x0 = Math.round(displayed.x * scale);
  const y0 = Math.round(displayed.y * scale);
  const x1 = Math.round((displayed.x + displayed.width) * scale);
  const y1 = Math.round((displayed.y + displayed.height) * scale);
  return [x0, y0, x1, y1];
}

/** box의 중심은 유지한 채 너비/높이만 targetW/targetH로 맞춘다. */
export function resizeBoxKeepingCenter(box: CropBox, targetW: number, targetH: number): CropBox {
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [
    Math.round(cx - targetW / 2),
    Math.round(cy - targetH / 2),
    Math.round(cx + targetW / 2),
    Math.round(cy + targetH / 2),
  ];
}

/** 크롭박스가 이미지(회전 캔버스) 바깥으로 나가지 않게 위치/크기를 보정한다. 전-후 동기화
 * (resizeBoxKeepingCenter)나 회전 시 재스케일 과정에서 박스가 경계 밖으로 밀려날 수 있어,
 * 표시 직전에 항상 이 함수를 거쳐 사진 범위 안으로 잘라낸다. */
export function clampBoxToBounds(box: CropBox, maxW: number, maxH: number): CropBox {
  const [x0, y0, x1, y1] = box;
  const w = Math.min(x1 - x0, maxW);
  const h = Math.min(y1 - y0, maxH);
  const clampedX0 = Math.min(Math.max(x0, 0), maxW - w);
  const clampedY0 = Math.min(Math.max(y0, 0), maxH - h);
  return [
    Math.round(clampedX0),
    Math.round(clampedY0),
    Math.round(clampedX0 + w),
    Math.round(clampedY0 + h),
  ];
}

/** 백엔드가 준(=natural 회전캔버스 기준) crop_box를 react-image-crop 표시용 좌표로 변환. */
export function naturalBoxToDisplayed(
  box: CropBox,
  displayedWidth: number,
  naturalWidth: number,
): PixelCrop {
  const scale = displayedWidth / naturalWidth;
  const [x0, y0, x1, y1] = box;
  return {
    unit: "px",
    x: x0 * scale,
    y: y0 * scale,
    width: (x1 - x0) * scale,
    height: (y1 - y0) * scale,
  };
}
