import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AngleSlider } from "../components/AngleSlider";
import { CropCanvas } from "../components/CropCanvas";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { usePhotos } from "../hooks/usePhotos";
import { useWizardStore } from "../store/wizardStore";
import { resizeBoxKeepingCenter } from "../utils/cropCoords";
import type { CropBox, PhotoOut } from "../api/types";

const SESSION_TYPE_LABEL: Record<string, string> = { start: "시작", mid: "중간", end: "마지막" };
const SESSION_TYPE_ORDER = ["start", "mid", "end"];

interface EditState {
  rotationDeg: number;
  cropBox: CropBox;
}

export function CropAdjustPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const patchPhoto = usePatchPhoto(sessionId!);
  const { guideOverlayVisible, toggleGuideOverlay, aiProposals } = useWizardStore();

  const classifiedPhotos = useMemo(
    () => (photosQuery.data?.photos ?? []).filter((p) => p.compos_id > 0),
    [photosQuery.data],
  );

  // 같은 구도(compos_id)의 시작/중간/마지막 사진을 한 그룹으로 묶어 나란히 보여준다.
  const composGroups = useMemo(() => {
    const map = new Map<number, PhotoOut[]>();
    for (const p of classifiedPhotos) {
      const arr = map.get(p.compos_id) ?? [];
      arr.push(p);
      map.set(p.compos_id, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([composId, photos]) => ({
        composId,
        photos: [...photos].sort(
          (a, b) => SESSION_TYPE_ORDER.indexOf(a.session_type) - SESSION_TYPE_ORDER.indexOf(b.session_type),
        ),
      }));
  }, [classifiedPhotos]);

  const [activeComposId, setActiveComposId] = useState<number | null>(null);
  useEffect(() => {
    if ((activeComposId === null || !composGroups.some((g) => g.composId === activeComposId)) && composGroups.length > 0) {
      setActiveComposId(composGroups[0].composId);
    }
  }, [composGroups, activeComposId]);

  const activeGroup = composGroups.find((g) => g.composId === activeComposId) ?? null;

  // 그룹을 바꿀 때만 편집 상태를 서버 값으로 재시드한다 (저장 후 refetch로 photo 참조가
  // 바뀌어도 편집 중인 값을 잃지 않기 위해 activeGroup.composId만 의존성으로 둔다).
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  useEffect(() => {
    if (!activeGroup) return;
    const next: Record<string, EditState> = {};
    for (const p of activeGroup.photos) {
      next[p.photo_id] = { rotationDeg: p.rotation_deg, cropBox: p.crop_box };
    }
    setEdits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.composId]);

  function handleBoxChange(photoId: string, box: CropBox) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], cropBox: box } } : prev));
  }

  // 사용자가 실제로 드래그해서 크기를 바꿨을 때만 같은 구도의 다른 사진들에도 크기를 맞춘다
  // (위치는 각자 유지 - backend crop.py의 sync_size와 동일한 방식).
  function handleUserResize(photoId: string, box: CropBox) {
    if (!activeGroup) return;
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of activeGroup.photos) {
        if (p.photo_id === photoId || !next[p.photo_id]) continue;
        next[p.photo_id] = { ...next[p.photo_id], cropBox: resizeBoxKeepingCenter(next[p.photo_id].cropBox, w, h) };
      }
      return next;
    });
  }

  function handleRotationChange(photoId: string, deg: number) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], rotationDeg: deg } } : prev));
  }

  if (photosQuery.isLoading) return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;
  if (composGroups.length === 0) {
    return (
      <p className="py-8 text-sm text-neutral-500">
        아직 구도가 배정된 사진이 없습니다. 이전 단계에서 분류를 먼저 완료해주세요.
      </p>
    );
  }

  const confirmedCount = classifiedPhotos.filter((p) => p.manually_confirmed).length;

  async function saveAll() {
    if (!activeGroup) return;
    for (const p of activeGroup.photos) {
      const edit = edits[p.photo_id];
      if (!edit) continue;
      await patchPhoto.mutateAsync({
        photoId: p.photo_id,
        patch: { rotation_deg: edit.rotationDeg, crop_box: edit.cropBox, manually_confirmed: true },
      });
    }
  }

  async function confirmAllAsIs() {
    if (!activeGroup) return;
    for (const p of activeGroup.photos) {
      await patchPhoto.mutateAsync({ photoId: p.photo_id, patch: { manually_confirmed: true } });
    }
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">{confirmedCount} / {classifiedPhotos.length}장 확인 완료</p>
        <button type="button" onClick={toggleGuideOverlay} className="text-xs text-neutral-500 underline">
          가이드 오버레이 {guideOverlayVisible ? "숨기기" : "보이기"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {composGroups.map((g) => {
          const allConfirmed = g.photos.every((p) => p.manually_confirmed);
          return (
            <button
              key={g.composId}
              type="button"
              onClick={() => setActiveComposId(g.composId)}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                g.composId === activeComposId
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600"
              }`}
            >
              {g.composId}. {g.photos[0].compos_label} {allConfirmed && "✓"}
            </button>
          );
        })}
      </div>

      {activeGroup && (
        <>
          <p className="text-xs text-neutral-400">
            사진 중 하나의 크롭 크기를 바꾸면 같은 구도의 나머지 사진들도 같은 크기로 맞춰집니다 (위치는 각자 유지).
          </p>
          <div
            className={`grid gap-4 ${activeGroup.photos.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            {activeGroup.photos.map((p) => {
              const edit = edits[p.photo_id];
              if (!edit) return null;
              const aiProposal = aiProposals[p.photo_id];
              return (
                <div key={p.photo_id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-700">{SESSION_TYPE_LABEL[p.session_type]}</h3>
                    {p.manually_confirmed && <span className="text-xs text-emerald-600">✓ 확인됨</span>}
                  </div>
                  <CropCanvas
                    photo={p}
                    rotationDeg={edit.rotationDeg}
                    cropBox={edit.cropBox}
                    guideOverlayVisible={guideOverlayVisible}
                    onBoxChange={(box) => handleBoxChange(p.photo_id, box)}
                    onUserResize={(box) => handleUserResize(p.photo_id, box)}
                  />
                  <AngleSlider
                    value={edit.rotationDeg}
                    aiValue={aiProposal?.rotation_deg ?? p.rotation_deg}
                    onChange={(v) => handleRotationChange(p.photo_id, v)}
                    onCommit={(v) => handleRotationChange(p.photo_id, v)}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirmAllAsIs}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              전체 AI 제안대로 확정
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={patchPhoto.isPending}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {patchPhoto.isPending ? "저장 중..." : "이 구도 전체 저장"}
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate(`/s/${sessionId}/match`)}
        className="self-end rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white"
      >
        다음: 매칭 확인 →
      </button>
    </div>
  );
}
