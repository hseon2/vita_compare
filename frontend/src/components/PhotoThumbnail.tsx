import type { PhotoOut } from "../api/types";
import { COMPOS } from "../config/compos";
import { ConfidenceBadge } from "./ConfidenceBadge";

const SESSION_TYPE_LABEL: Record<string, string> = { start: "시작", mid: "중간", end: "마지막" };

interface PhotoThumbnailProps {
  photo: PhotoOut;
  onReassignCompos?: (newComposId: number) => void;
  readOnly?: boolean;
}

export function PhotoThumbnail({ photo, onReassignCompos, readOnly }: PhotoThumbnailProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 bg-white p-2">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
        <img src={photo.thumbnail_url} alt={photo.compos_label} className="h-full w-full object-cover" />
        {photo.duplicate && (
          <span className="absolute top-1 right-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            중복
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-neutral-500">{SESSION_TYPE_LABEL[photo.session_type]}</span>
        <ConfidenceBadge
          confidence={photo.classification_confidence}
          lowConfidence={photo.low_confidence}
          poseError={photo.pose_error}
          manuallyConfirmed={photo.manually_confirmed}
        />
      </div>
      {!readOnly && onReassignCompos ? (
        <select
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          value={photo.compos_id}
          onChange={(e) => onReassignCompos(Number(e.target.value))}
        >
          <option value={0}>미분류</option>
          {COMPOS.map(([id, label]) => (
            <option key={id} value={id}>
              {id}. {label}
            </option>
          ))}
        </select>
      ) : (
        <p className="truncate text-sm font-medium text-neutral-800">
          {photo.compos_id > 0 ? `${photo.compos_id}. ${photo.compos_label}` : "미분류"}
        </p>
      )}
    </div>
  );
}
