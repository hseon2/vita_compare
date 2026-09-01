import { useRef, useState } from "react";
import type { PhotoOut, SessionType } from "../api/types";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";

interface UploadSlotProps {
  sessionType: SessionType;
  photos: PhotoOut[];
  date: string;
  onDateChange: (v: string) => void;
  onFilesSelected: (files: File[]) => Promise<boolean> | void;
  uploading?: boolean;
  onDeletePhoto?: (photoId: string) => void;
  onOpenLightbox?: (photo: PhotoOut) => void;
  /** 다른 섹션에서 드래그해온 사진을 이 세션타입으로 옮긴다 - 있으면 카드도 드래그 가능해진다 */
  onMovePhoto?: (photoId: string, targetSessionType: SessionType) => void;
}

export function UploadSlot({
  sessionType,
  photos,
  date,
  onDateChange,
  onFilesSelected,
  uploading,
  onDeletePhoto,
  onOpenLightbox,
  onMovePhoto,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragEnabled = !!onMovePhoto;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
        isDragOver ? "border-brand-500 ring-2 ring-brand-300" : "border-neutral-200"
      }`}
      onDragOver={
        dragEnabled
          ? (e) => {
              e.preventDefault();
              setIsDragOver(true);
            }
          : undefined
      }
      onDragLeave={dragEnabled ? () => setIsDragOver(false) : undefined}
      onDrop={
        dragEnabled
          ? (e) => {
              e.preventDefault();
              setIsDragOver(false);
              const photoId = e.dataTransfer.getData("text/plain");
              if (photoId) onMovePhoto!(photoId, sessionType);
            }
          : undefined
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800">{SESSION_TYPE_LABEL[sessionType]}</h3>
        <span className="text-xs text-neutral-500">사진 {photos.length}장</span>
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
            if (files.length > 0) await onFilesSelected(files);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={
            photos.length > 0
              ? "rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              : "rounded-xl bg-brand-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-50"
          }
        >
          {uploading ? "업로드 중..." : photos.length > 0 ? "추가 업로드" : "사진 업로드"}
        </button>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {photos.map((photo) => (
            <div
              key={photo.photo_id}
              draggable={dragEnabled}
              onDragStart={
                dragEnabled
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", photo.photo_id);
                      e.dataTransfer.effectAllowed = "move";
                    }
                  : undefined
              }
              className={`group relative h-14 w-14 shrink-0 overflow-hidden rounded border border-neutral-200 ${
                dragEnabled ? "cursor-grab active:cursor-grabbing" : ""
              }`}
            >
              <img
                src={photo.thumbnail_url}
                alt={photo.original_filename}
                onClick={onOpenLightbox ? () => onOpenLightbox(photo) : undefined}
                className={`h-full w-full object-cover ${onOpenLightbox ? "cursor-pointer" : ""}`}
              />
              {onDeletePhoto && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePhoto(photo.photo_id);
                  }}
                  aria-label="사진 삭제"
                  className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
