import { useRef } from "react";
import type { SessionType } from "../api/types";

const SESSION_TYPE_LABEL: Record<SessionType, string> = { start: "시작", mid: "중간", end: "마지막" };

interface UploadSlotProps {
  sessionType: SessionType;
  existingCount: number;
  date: string;
  onDateChange: (v: string) => void;
  onFilesSelected: (files: File[]) => void;
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

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800">{SESSION_TYPE_LABEL[sessionType]} 촬영</h3>
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
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onFilesSelected(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "사진 선택"}
        </button>
      </div>
    </div>
  );
}
