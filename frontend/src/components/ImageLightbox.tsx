import { useEffect } from "react";

interface ImageLightboxProps {
  imageUrl: string;
  fileName: string;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, fileName, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full max-w-3xl flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={imageUrl} alt={fileName} className="max-h-[75vh] w-auto rounded-xl object-contain shadow-2xl" />
        <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm text-neutral-700 shadow">
          <span className="truncate">{fileName || "파일명 없음"}</span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
