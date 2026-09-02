// backend/preprocessing/cropper.py 포팅. 랜드마크 기반 자동 크롭 제안(옛 compute_crop_box)은
// 사용자 요청으로 제거했다 - 기본 크롭은 항상 "구도 비율에 맞춘 이미지 전체 중앙 크롭"이고,
// 사람이 CropCanvas에서 직접 조정한다.
import { renderRotatedImage } from "../utils/imageRotation";
import { CROP_RATIOS } from "./preprocessConfig";
import type { CropBox } from "../api/types";

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

/** 기본 크롭박스: 이미지 전체를 구도 비율에 맞춰 중앙 크롭. */
export function defaultCropBox(imgW: number, imgH: number, ratioW: number, ratioH: number): CropBox {
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

/** 편의 함수: 이미지 엘리먼트 + 구도 번호로 기본 크롭박스를 바로 계산. */
export function defaultCropBoxForImage(img: HTMLImageElement, composId: number): CropBox {
  return defaultCropBoxForDims(img.naturalWidth, img.naturalHeight, composId);
}

/** width/height를 이미 알고 있을 때(업로드 시 저장해둔 값 등) 이미지를 다시 디코딩하지 않고
 * 바로 기본 크롭박스를 계산한다 - 옵션 화면에서 구도만 바꿀 때마다 이미지를 매번 새로
 * 디코딩하면, HEIC 등 브라우저가 못 읽는 형식의 사진에서 디코딩이 실패해 저장 자체가
 * 조용히 실패하고 "다음" 버튼이 반응 없는 것처럼 보이는 문제가 있었다. */
export function defaultCropBoxForDims(imgW: number, imgH: number, composId: number): CropBox {
  const [ratioW, ratioH] = CROP_RATIOS[composId] ?? [3, 4];
  return defaultCropBox(imgW, imgH, ratioW, ratioH);
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
    [x0, y0, x1, y1] = defaultCropBox(rotated.width, rotated.height, ratioW, ratioH);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(rotated, x0, y0, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL("image/jpeg", 0.95), width: w, height: h };
}
