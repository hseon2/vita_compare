import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactCrop, { type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { CropBox, PhotoOut } from "../api/types";
import { getCropHint } from "../config/cropHints";
import { displayedToNaturalBox, naturalBoxToDisplayed } from "../utils/cropCoords";
import { getRotatedCanvasSize, renderRotatedImage } from "../utils/imageRotation";

interface CropCanvasProps {
  photo: PhotoOut;
  rotationDeg: number; // 부모가 소유하는 현재(커밋 전 포함) 회전각
  cropBox: CropBox; // 부모가 소유하는 현재 크롭박스 (회전캔버스 픽셀 기준)
  guideOverlayVisible: boolean;
  /** 초기 시드/회전에 따른 내부 재조정 등 "부모 상태 동기화"용 - 다른 사진에 전파하면 안 됨 */
  onBoxChange: (box: CropBox) => void;
  /** 사용자가 실제로 드래그해서 크기/위치를 바꿨을 때만 호출 - 전-후 사이즈 동기화 트리거용 */
  onUserResize?: (box: CropBox) => void;
}

export function CropCanvas({
  photo,
  rotationDeg,
  cropBox,
  guideOverlayVisible,
  onBoxChange,
  onUserResize,
}: CropCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 카드(그리드 셀) 실제 폭을 측정한다 - 고정폭(px)을 쓰면 사이드바/그리드 폭에 따라
  // 사진이 카드 밖으로 넘치는 문제가 있었다.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rawImgRef = useRef<HTMLImageElement | null>(null);
  const prevRotatedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const rotationDegRef = useRef(rotationDeg);
  rotationDegRef.current = rotationDeg;
  const [rotatedDataUrl, setRotatedDataUrl] = useState<string | null>(null);
  const [rotatedSize, setRotatedSize] = useState<{ width: number; height: number } | null>(null);
  const [displayCrop, setDisplayCrop] = useState<PixelCrop | null>(null);

  // 원본(회전 전) 이미지를 한 번 로드. onload가 비동기라 최신 회전각은 ref로 읽는다.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      rawImgRef.current = img;
      prevRotatedSizeRef.current = null;
      rerender(rotationDegRef.current);
    };
    img.src = photo.thumbnail_url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.thumbnail_url]);

  // 회전각이 바뀔 때마다 회전 캔버스를 다시 그리고, 기존 박스를 새 캔버스 크기에 비례해 재조정
  useEffect(() => {
    if (!rawImgRef.current) return;
    rerender(rotationDeg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationDeg]);

  function rerender(deg: number) {
    const img = rawImgRef.current;
    if (!img) return;

    const canvas = renderRotatedImage(img, deg);
    const newSize = { width: canvas.width, height: canvas.height };
    const prevSize = prevRotatedSizeRef.current;

    setRotatedDataUrl(canvas.toDataURL("image/png"));
    setRotatedSize(newSize);
    prevRotatedSizeRef.current = newSize;

    const isFirstRender = prevSize === null;
    const hasStoredBox = cropBox.some((v) => v !== 0);

    if (isFirstRender && hasStoredBox) {
      // 서버가 준 crop_box(=현재 rotationDeg 기준)를 그대로 시작점으로 사용
      onBoxChange(cropBox);
    } else if (isFirstRender) {
      const defaultSize = getRotatedCanvasSize(img.naturalWidth, img.naturalHeight, deg);
      onBoxChange(centeredBox(defaultSize.width, defaultSize.height));
    } else if (prevSize) {
      // 회전각이 바뀌어 캔버스 크기가 달라짐 - 기존 박스를 비율에 맞춰 재조정
      const scaleX = newSize.width / prevSize.width;
      const scaleY = newSize.height / prevSize.height;
      const [x0, y0, x1, y1] = cropBox;
      const rescaled: CropBox = [
        Math.round(x0 * scaleX),
        Math.round(y0 * scaleY),
        Math.round(x1 * scaleX),
        Math.round(y1 * scaleY),
      ];
      onBoxChange(rescaled);
    }
  }

  function centeredBox(w: number, h: number): CropBox {
    const mx = Math.round(w * 0.1);
    const my = Math.round(h * 0.1);
    return [mx, my, w - mx, h - my];
  }

  // cropBox(natural) -> displayCrop(표시 px) 동기화
  useEffect(() => {
    if (!rotatedSize || !containerWidth) return;
    const displayedWidth = Math.min(containerWidth, rotatedSize.width);
    setDisplayCrop(naturalBoxToDisplayed(cropBox, displayedWidth, rotatedSize.width));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropBox, rotatedSize, containerWidth]);

  return (
    <div ref={containerRef} className="flex w-full flex-col gap-2">
      {(!rotatedDataUrl || !rotatedSize || !displayCrop || !containerWidth) ? (
        <div className="flex h-64 items-center justify-center text-sm text-neutral-400">이미지 준비 중...</div>
      ) : (
        <CropCanvasInner
          photo={photo}
          rotatedDataUrl={rotatedDataUrl}
          rotatedSize={rotatedSize}
          displayCrop={displayCrop}
          containerWidth={containerWidth}
          guideOverlayVisible={guideOverlayVisible}
          setDisplayCrop={setDisplayCrop}
          onBoxChange={onBoxChange}
          onUserResize={onUserResize}
        />
      )}
    </div>
  );
}

interface CropCanvasInnerProps {
  photo: PhotoOut;
  rotatedDataUrl: string;
  rotatedSize: { width: number; height: number };
  displayCrop: PixelCrop;
  containerWidth: number;
  guideOverlayVisible: boolean;
  setDisplayCrop: (c: PixelCrop) => void;
  onBoxChange: (box: CropBox) => void;
  onUserResize?: (box: CropBox) => void;
}

function CropCanvasInner({
  photo,
  rotatedDataUrl,
  rotatedSize,
  displayCrop,
  containerWidth,
  guideOverlayVisible,
  setDisplayCrop,
  onBoxChange,
  onUserResize,
}: CropCanvasInnerProps) {
  const displayedWidth = Math.min(containerWidth, rotatedSize.width);
  const displayedHeight = rotatedSize.height * (displayedWidth / rotatedSize.width);
  const guideLineY = displayCrop.y + displayCrop.height / 2;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative" style={{ width: displayedWidth, maxWidth: "100%" }}>
        <ReactCrop
          crop={displayCrop}
          onChange={(c) => setDisplayCrop(c)}
          onComplete={(c) => {
            const box = displayedToNaturalBox(c, displayedWidth, rotatedSize.width);
            onBoxChange(box);
            onUserResize?.(box);
          }}
        >
          <img
            src={rotatedDataUrl}
            alt="회전된 원본"
            style={{ width: displayedWidth, height: displayedHeight, display: "block" }}
          />
        </ReactCrop>

        {/* 보조선(수평 기준선) - 항상 노출, 현재 크롭박스 세로 중앙에 표시 */}
        <div
          className="pointer-events-none absolute right-0 left-0 border-t-2 border-dashed border-sky-400"
          style={{ top: guideLineY }}
        />

        {/* 투명 가이드 오버레이 - 토글 가능, 16개 구도 공용 임시 자리표시자 */}
        {guideOverlayVisible && (
          <img
            src="/guides/generic-guide.png"
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full opacity-40 mix-blend-multiply"
          />
        )}
      </div>
      <p className="text-xs text-neutral-500">가이드: {getCropHint(photo.compos_id)}</p>
    </div>
  );
}
