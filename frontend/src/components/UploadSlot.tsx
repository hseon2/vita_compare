import { useEffect, useRef, useState } from "react";
import type { SessionType } from "../api/types";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";

interface UploadSlotProps {
  sessionType: SessionType;
  existingCount: number;
  date: string;
  onDateChange: (v: string) => void;
  onFilesSelected: (files: File[]) => Promise<boolean> | void;
  uploading?: boolean;
}

export function UploadSlot({
  sessionType,
  existingCount,
  date,
  onDateChange,
  onFilesSelected,
  uploading,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // "사진 선택"을 여러 번 눌러도 이전에 고른 사진들의 미리보기가 사라지지 않고 계속 쌓이도록
  // 누적한다 (이전엔 매번 최신 선택으로 갈아치워서 마치 이전 선택이 사라진 것처럼 보였다).
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const allCreatedUrlsRef = useRef<string[]>([]);

  // 컴포넌트가 사라질 때만 지금까지 만든 objectURL을 전부 정리한다.
  useEffect(() => {
    return () => {
      allCreatedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800">{SESSION_TYPE_LABEL[sessionType]}</h3>
        <span className="text-xs text-neutral-500">사진 {existingCount}장</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          촬영일
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
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
            // 업로드가 실제로 성공했을 때만 미리보기를 추가한다 - 실패했는데도 썸네일이
            // 쌓이면 마치 사진이 저장된 것처럼 보여 사용자가 오류 메시지를 놓치게 된다.
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
      </div>

      {previewUrls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {previewUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="h-10 w-10 rounded border border-neutral-200 object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
