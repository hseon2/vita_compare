import { useEffect, useRef, useState } from "react";

interface BatchUploadSlotProps {
  existingCount: number;
  onFilesSelected: (files: File[]) => Promise<boolean> | void;
  uploading?: boolean;
}

// UploadSlot과 달리 촬영일을 사람이 입력하지 않는다 - 선택한 파일들의 날짜로 자동 구분하므로
// 이 컴포넌트는 "파일 선택 + 미리보기"만 담당한다.
export function BatchUploadSlot({ existingCount, onFilesSelected, uploading }: BatchUploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const allCreatedUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      allCreatedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800">전/후 사진 한 번에 업로드</h3>
        <span className="text-xs text-neutral-500">사진 {existingCount}장</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        시작일/종료일(장기 모드는 중간일 포함) 사진을 한꺼번에 선택하면 촬영일 기준으로 자동 구분됩니다.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length === 0) return;
          const ok = await onFilesSelected(files);
          if (ok === false) return;
          const newUrls = files.map((f) => URL.createObjectURL(f));
          allCreatedUrlsRef.current.push(...newUrls);
          setPreviewUrls((prev) => [...prev, ...newUrls]);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={
          existingCount > 0
            ? "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-opacity hover:bg-neutral-50 disabled:opacity-50"
            : "rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
        }
      >
        {uploading ? "업로드 중..." : existingCount > 0 ? "추가 업로드" : "사진 업로드"}
      </button>

      {previewUrls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {previewUrls.map((url, i) => (
            <img key={i} src={url} alt="" className="h-10 w-10 rounded border border-neutral-200 object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}
