import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactCrop, { type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { CropBox, PhotoOut } from "../api/types";
import { getCropHint } from "../config/cropHints";
import { clampBoxToBounds, displayedToNaturalBox, naturalBoxToDisplayed } from "../utils/cropCoords";
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
  const [zoom, setZoom] = useState(1);

  // 원본(회전 전) 이미지를 한 번 로드. onload가 비동기라 최신 회전각은 ref로 읽는다.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      rawImgRef.current = img;
      prevRotatedSizeRef.current = null;
      setZoom(1);
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
  // 크롭박스는 항상 사진 범위 안으로 잘라낸 뒤에만 화면에 반영한다 - 전/후 크기 동기화나
  // 회전 재스케일 과정에서 박스가 경계 밖으로 밀려나는 걸 막는다(실사용 피드백). 보정이
  // 실제로 일어났으면 부모 상태도 고쳐서 다음 저장 때 잘못된 값이 남지 않게 한다.
  useEffect(() => {
    if (!rotatedSize || !containerWidth) return;
    const clamped = clampBoxToBounds(cropBox, rotatedSize.width, rotatedSize.height);
    if (clamped.some((v, i) => v !== cropBox[i])) {
      onBoxChange(clamped);
      return;
    }
    const displayedWidth = Math.min(containerWidth, rotatedSize.width) * zoom;
    setDisplayCrop(naturalBoxToDisplayed(clamped, displayedWidth, rotatedSize.width));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropBox, rotatedSize, containerWidth, zoom]);

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
          zoom={zoom}
          setZoom={setZoom}
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
  zoom: number;
  setZoom: (updater: (z: number) => number) => void;
  guideOverlayVisible: boolean;
  setDisplayCrop: (c: PixelCrop) => void;
  onBoxChange: (box: CropBox) => void;
  onUserResize?: (box: CropBox) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function CropCanvasInner({
  photo,
  rotatedDataUrl,
  rotatedSize,
  displayCrop,
  containerWidth,
  zoom,
  setZoom,
  guideOverlayVisible,
  setDisplayCrop,
  onBoxChange,
  onUserResize,
}: CropCanvasInnerProps) {
  // 확대 안 한 기본 크기(=스크롤 뷰포트 크기) - 확대하면 실제 이미지(displayedWidth/Height)는
  // 이보다 커지고, 뷰포트는 그대로라 overflow-auto로 스크롤/드래그해서 이동한다.
  const baseWidth = Math.min(containerWidth, rotatedSize.width);
  const baseHeight = rotatedSize.height * (baseWidth / rotatedSize.width);
  const displayedWidth = baseWidth * zoom;
  const displayedHeight = rotatedSize.height * (displayedWidth / rotatedSize.width);
  const guideLineY = displayCrop.y + displayCrop.height / 2;

  return (
    <div className="flex flex-col gap-2">
      {/* 초기화 버튼을 flex 흐름 밖(absolute)에 둬서 나타났다 사라져도 −/％/+ 그룹의
          중앙 정렬(특히 퍼센트 숫자가 실제 가운데 오는 것)에 영향을 주지 않게 한다. */}
      <div className="relative flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}
          disabled={zoom <= MIN_ZOOM}
          className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-sm leading-none text-neutral-600 disabled:opacity-30"
          aria-label="축소"
        >
          −
        </button>
        <span className="w-10 text-center text-[11px] text-neutral-500">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}
          disabled={zoom >= MAX_ZOOM}
          className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-sm leading-none text-neutral-600 disabled:opacity-30"
          aria-label="확대"
        >
          ＋
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => setZoom(() => 1)}
            className="absolute top-1/2 right-0 -translate-y-1/2 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-50"
          >
            초기화
          </button>
        )}
      </div>
      <div
        className="relative overflow-auto rounded-lg bg-neutral-50 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ width: baseWidth, maxWidth: "100%", height: baseHeight }}
      >
        <div className="relative" style={{ width: displayedWidth, height: displayedHeight }}>
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
      </div>
      <p className="text-xs text-neutral-500">가이드: {getCropHint(photo.compos_id)}</p>
    </div>
  );
}
