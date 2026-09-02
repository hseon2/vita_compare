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
  /** 같은 세션타입 안에서 사진을 드래그해 순서를 바꿨을 때, 바뀐 전체 순서(photo_id 배열)를 넘긴다 */
  onReorder?: (orderedPhotoIds: string[]) => void;
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
  onReorder,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverPhotoId, setDragOverPhotoId] = useState<string | null>(null);
  // 놓았을 때 이 사진의 왼쪽/오른쪽 중 어디에 끼워질지 - 드래그 중 마우스 위치로 계속 갱신하고,
  // 그 자리에 세로선으로 미리 보여준다(어디에 놓일지 몰라 답답하다는 피드백 반영).
  const [dragOverSide, setDragOverSide] = useState<"before" | "after" | null>(null);
  const dragEnabled = !!onMovePhoto || !!onReorder;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] transition-colors ${
        isDragOver ? "border-brand-500 ring-2 ring-brand-300" : "border-neutral-100"
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
              // 사진 위가 아니라 카드의 빈 공간에 놓은 경우 - 다른 슬롯에서 온 사진이면 이
              // 세션타입으로 옮기고(맨 끝에 붙음), 같은 슬롯 사진이면 아무 것도 안 한다(이미
              // 여기 있으므로).
              const photoId = e.dataTransfer.getData("text/plain");
              if (photoId && !photos.some((p) => p.photo_id === photoId)) onMovePhoto?.(photoId, sessionType);
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
          {photos.map((photo, idx) => (
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
              onDragOver={
                dragEnabled
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const side = e.clientX - rect.left < rect.width / 2 ? "before" : "after";
                      setDragOverPhotoId(photo.photo_id);
                      setDragOverSide(side);
                    }
                  : undefined
              }
              onDragLeave={
                dragEnabled
                  ? () =>
                      setDragOverPhotoId((id) => {
                        if (id !== photo.photo_id) return id;
                        setDragOverSide(null);
                        return null;
                      })
                  : undefined
              }
              onDrop={
                dragEnabled
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const side = dragOverSide;
                      setDragOverPhotoId(null);
                      setDragOverSide(null);
                      setIsDragOver(false);
                      const draggedId = e.dataTransfer.getData("text/plain");
                      if (!draggedId || draggedId === photo.photo_id) return;
                      const draggedIdx = photos.findIndex((p) => p.photo_id === draggedId);
                      if (draggedIdx === -1) {
                        // 다른 세션타입에서 드래그해온 사진 - 이 사진 자리로 옮겨 넣는다.
                        onMovePhoto?.(draggedId, sessionType);
                        return;
                      }
                      // 같은 슬롯 안 - 놓은 사진의 왼쪽/오른쪽(세로선 표시된 쪽)으로 순서를 옮긴다.
                      if (!onReorder) return;
                      const order = photos.map((p) => p.photo_id);
                      order.splice(draggedIdx, 1);
                      let insertAt = side === "after" ? idx + 1 : idx;
                      if (draggedIdx < insertAt) insertAt -= 1;
                      order.splice(insertAt, 0, draggedId);
                      onReorder(order);
                    }
                  : undefined
              }
              className={`group relative h-14 w-14 shrink-0 overflow-hidden rounded border-2 border-neutral-200 transition-colors ${
                dragEnabled ? "cursor-grab active:cursor-grabbing" : ""
              }`}
            >
              <img
                src={photo.thumbnail_url}
                alt={photo.original_filename}
                onClick={onOpenLightbox ? () => onOpenLightbox(photo) : undefined}
                className={`h-full w-full object-cover ${onOpenLightbox ? "cursor-pointer" : ""}`}
              />
              {dragOverPhotoId === photo.photo_id && dragOverSide && (
                <div
                  className={`pointer-events-none absolute top-0 z-10 h-full w-[3px] rounded-full bg-brand-600 ${
                    dragOverSide === "before" ? "left-0" : "right-0"
                  }`}
                />
              )}
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
