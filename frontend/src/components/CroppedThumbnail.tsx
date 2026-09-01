import { useEffect, useState } from "react";
import { renderRotatedImage } from "../utils/imageRotation";
import type { PhotoOut } from "../api/types";

interface CroppedThumbnailProps {
  photo: PhotoOut;
  alt?: string;
  className?: string;
}

/** crop_box(rotation_deg 적용 후 캔버스 기준)를 실제로 회전+크롭해서 보여준다. 비파괴 원칙상
 * 실제 픽셀 크롭 파일은 PPT 생성 시점에만 만들어지므로(preprocessing/cropper.py 참고),
 * 화면에서는 canvas로 같은 연산을 재현해 "크롭된 것처럼" 미리 보여준다. */
export function CroppedThumbnail({ photo, alt, className }: CroppedThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [x0, y0, x1, y1] = photo.crop_box;

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const rotated = renderRotatedImage(img, photo.rotation_deg);
      const hasCrop = x1 > x0 && y1 > y0;
      if (!hasCrop) {
        setDataUrl(rotated.toDataURL("image/jpeg", 0.85));
        return;
      }
      const w = x1 - x0;
      const h = y1 - y0;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d")!.drawImage(rotated, x0, y0, w, h, 0, 0, w, h);
      setDataUrl(out.toDataURL("image/jpeg", 0.85));
    };
    img.src = photo.thumbnail_url;
    return () => {
      cancelled = true;
    };
  }, [photo.thumbnail_url, photo.rotation_deg, x0, y0, x1, y1]);

  if (!dataUrl) {
    return <div className={`animate-pulse bg-neutral-100 ${className ?? ""}`} />;
  }
  return <img src={dataUrl} alt={alt ?? ""} className={className} />;
}
