import type { PhotoOut } from "../api/types";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface PhotoThumbnailProps {
  photo: PhotoOut;
  /** 카드를 클릭했을 때 - 재지정 대상으로 선택하는 용도 */
  onClick?: () => void;
  /** 현재 재지정 대상으로 선택된 사진인지 (테두리 강조 표시) */
  selected?: boolean;
}

export function PhotoThumbnail({ photo, onClick, selected }: PhotoThumbnailProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-lg border bg-white p-2 ${
        selected ? "border-brand-700 ring-2 ring-brand-600" : "border-neutral-200"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-md bg-neutral-100">
        <img src={photo.thumbnail_url} alt={photo.compos_label} className="h-full w-full object-cover" />
        {photo.manually_confirmed && (
          <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow">
            ✓
          </span>
        )}
        {photo.duplicate && (
          <span className="absolute top-1 right-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            중복
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="shrink-0 text-xs whitespace-nowrap text-neutral-500">{SESSION_TYPE_LABEL[photo.session_type]}</span>
        <ConfidenceBadge
          confidence={photo.classification_confidence}
          lowConfidence={photo.low_confidence}
          poseError={photo.pose_error}
          manuallyConfirmed={photo.manually_confirmed}
        />
      </div>
      <p className="truncate text-sm font-medium text-neutral-800">
        {photo.compos_id > 0 ? `${photo.compos_id}. ${photo.compos_label}` : "미분류"}
      </p>
    </div>
  );
}
