import { useEffect, useState } from "react";
import { COMPOS } from "../config/compos";
import { type CroppedImage, exportCroppedImage } from "../lib/cropper";
import { computePhotoSlideLayout, SLIDE_H, SLIDE_W } from "../lib/slideLayout";
import type { CropBox, PhotoOut } from "../api/types";

interface EditState {
  rotationDeg: number;
  cropBox: CropBox;
  slideScale?: number;
  slideSpread?: number;
}

interface PptSlidePreviewProps {
  composId: number;
  beforePhoto: PhotoOut | null;
  afterPhoto: PhotoOut | null;
  beforeEdit: EditState | null;
  afterEdit: EditState | null;
  wide: boolean;
}

function useLiveCrop(photo: PhotoOut | null, edit: EditState | null, composId: number): CroppedImage | null {
  const [crop, setCrop] = useState<CroppedImage | null>(null);

  useEffect(() => {
    if (!photo || !edit) {
      setCrop(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setCrop(exportCroppedImage(img, edit.rotationDeg, edit.cropBox, composId));
    };
    img.src = photo.thumbnail_url;
    return () => {
      cancelled = true;
    };
  }, [photo, edit, composId]);

  return crop;
}

/** 크롭 화면에서 지금 편집 중인 회전/크롭이 실제 PPT 슬라이드에 어떻게 들어갈지 그대로
 * 보여준다. lib/pptGenerator.ts의 addPhotoSlide와 같은 lib/slideLayout.ts를 쓰고, 크롭
 * 이미지도 같은 lib/cropper.ts의 exportCroppedImage로 만들어서 실제 생성 결과와 완전히
 * 동일하다(글꼴/날짜 캡션 등 장식 요소는 제외 - 사진 배치/크기만 정확히 일치). */
export function PptSlidePreview({ composId, beforePhoto, afterPhoto, beforeEdit, afterEdit, wide }: PptSlidePreviewProps) {
  const beforeCrop = useLiveCrop(beforePhoto, beforeEdit, composId);
  const afterCrop = useLiveCrop(afterPhoto, afterEdit, composId);

  const label = COMPOS.find(([id]) => id === composId)?.[1] ?? "";
  const pctX = (inches: number) => `${(inches / SLIDE_W) * 100}%`;
  const pctY = (inches: number) => `${(inches / SLIDE_H) * 100}%`;

  const layout = computePhotoSlideLayout(
    beforeCrop ?? { width: 1, height: 1 },
    afterCrop ?? { width: 1, height: 1 },
    wide,
    false,
    beforeEdit?.slideScale ?? 1,
    afterEdit?.slideScale ?? 1,
    beforeEdit?.slideSpread ?? afterEdit?.slideSpread ?? 0,
  );

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm"
      style={{ aspectRatio: `${SLIDE_W} / ${SLIDE_H}` }}
    >
      <div className="absolute top-[2.7%] left-[2.3%] rounded border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-neutral-800 shadow-sm">
        {composId}. {label}
      </div>

      {!beforeCrop && !afterCrop && (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">미리보기 준비 중...</div>
      )}

      {beforeCrop && (
        <img
          src={beforeCrop.dataUrl}
          alt="전 미리보기"
          className="absolute object-contain"
          style={{
            left: pctX(layout.before.x),
            top: pctY(layout.before.y),
            width: pctX(layout.before.w),
            height: pctY(layout.before.h),
          }}
        />
      )}
      {afterCrop && (
        <img
          src={afterCrop.dataUrl}
          alt="후 미리보기"
          className="absolute object-contain"
          style={{
            left: pctX(layout.after.x),
            top: pctY(layout.after.y),
            width: pctX(layout.after.w),
            height: pctY(layout.after.h),
          }}
        />
      )}
    </div>
  );
}
