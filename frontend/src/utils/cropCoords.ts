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

/** box의 중심은 유지한 채 너비/높이만 targetW/targetH로 맞춘다.
 * backend/api/routes/crop.py의 sync_size 로직(동일 구도 사진들 간 크기만 동기화, 위치는 각자 유지)과
 * 동일한 방식으로, 전-후 크롭 화면에서 한 사진의 크기를 바꾸면 나머지 사진에도 실시간으로 반영한다. */
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
