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

/** 전-후 크롭 동기화용: box의 중심과 "크기"(면적)는 그대로 둔 채 가로세로 비율만 targetRatio
 * (w/h)에 맞춘다. 한 사진의 크롭박스를 드래그로 바꾸면 반대쪽 사진도 같은 비율로 맞춰지되,
 * 반대쪽 사진 자체의 크롭 크기(원본에서 실제로 잡아낸 영역의 넓이)는 그대로 유지된다 -
 * 촬영 거리가 달라 두 사진의 인물 크기가 다를 수 있으므로, 픽셀 크기까지 강제로 똑같이 맞추면
 * 오히려 어색해진다. */
export function applyRatioKeepingArea(box: CropBox, targetRatio: number): CropBox {
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const area = (x1 - x0) * (y1 - y0);
  const newW = Math.sqrt(area * targetRatio);
  const newH = Math.sqrt(area / targetRatio);
  return [
    Math.round(cx - newW / 2),
    Math.round(cy - newH / 2),
    Math.round(cx + newW / 2),
    Math.round(cy + newH / 2),
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
