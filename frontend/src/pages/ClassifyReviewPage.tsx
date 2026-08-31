import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PhotoThumbnail } from "../components/PhotoThumbnail";
import { COMPOS } from "../config/compos";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { usePhotos } from "../hooks/usePhotos";
import type { PhotoOut } from "../api/types";

const SESSION_TYPE_LABEL: Record<string, string> = { start: "시작", mid: "중간", end: "마지막" };

export function ClassifyReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const patchPhoto = usePatchPhoto(sessionId!);

  const grouped = useMemo(() => {
    const map = new Map<number, PhotoOut[]>();
    for (const p of photosQuery.data?.photos ?? []) {
      const arr = map.get(p.compos_id) ?? [];
      arr.push(p);
      map.set(p.compos_id, arr);
    }
    return map;
  }, [photosQuery.data]);

  const groupOrder = [0, ...COMPOS.map(([id]) => id)];
  const missing = photosQuery.data?.missing_compos ?? {};
  const missingEntries = Object.entries(missing).filter(([, ids]) => ids.length > 0);

  return (
    <div className="flex flex-col gap-6 py-4">
      {missingEntries.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-1 font-medium">아직 배정되지 않은 구도가 있습니다</p>
          <ul className="list-inside list-disc">
            {missingEntries.map(([type, ids]) => (
              <li key={type}>
                {SESSION_TYPE_LABEL[type] ?? type}: {ids.join(", ")}번
              </li>
            ))}
          </ul>
        </div>
      )}

      {groupOrder.map((composId) => {
        const photos = grouped.get(composId);
        if (!photos || photos.length === 0) return null;
        const label =
          composId === 0 ? "미분류" : `${composId}. ${COMPOS.find(([id]) => id === composId)?.[1] ?? ""}`;
        return (
          <section key={composId}>
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">{label}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((photo) => (
                <PhotoThumbnail
                  key={photo.photo_id}
                  photo={photo}
                  onReassignCompos={(newId) =>
                    patchPhoto.mutate({ photoId: photo.photo_id, patch: { compos_id: newId } })
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => navigate(`/s/${sessionId}/crop`)}
        className="self-end rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white"
      >
        다음: 수평/크롭 조정 →
      </button>
    </div>
  );
}
