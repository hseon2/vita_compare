import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AngleSlider } from "../components/AngleSlider";
import { CropCanvas } from "../components/CropCanvas";
import { PptSlidePreview } from "../components/PptSlidePreview";
import { COMPOS, WIDE_COMPOS } from "../config/compos";
import { getGuideImageUrl, sideForSessionType } from "../config/guideImages";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { usePhotos } from "../hooks/usePhotos";
import { useWizardStore } from "../store/wizardStore";
import { deriveModeFromPhotos, getSetPairing } from "../utils/derive";
import { applyRatioKeepingArea, resizeBoxKeepingCenter } from "../utils/cropCoords";
import type { CropBox, PhotoOut, SessionType } from "../api/types";

interface EditState {
  rotationDeg: number;
  cropBox: CropBox;
}

interface CropUnit {
  composId: number;
  beforeType: SessionType;
  afterType: SessionType;
  beforePhoto: PhotoOut | null;
  afterPhoto: PhotoOut | null;
}

// 2단계(옵션 선택)에서 확정된 사진들을 구도(1~16) x 세션타입 페어(표준모드: 시작-종료 1쌍,
// 장기모드: 시작-중간/중간-종료 2쌍) 단위로 묶어, 한 쌍씩 순차로 회전/크롭을 조정한다.
export function CropAdjustPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const patchPhoto = usePatchPhoto(sessionId!);
  const { guideOverlayVisible, toggleGuideOverlay } = useWizardStore();

  const allPhotos = useMemo(() => photosQuery.data?.photos ?? [], [photosQuery.data]);
  const mode = photosQuery.data ? deriveModeFromPhotos(photosQuery.data) : "standard";

  const cropUnits = useMemo(() => {
    const byKey = new Map<string, PhotoOut>();
    for (const p of allPhotos) {
      if (p.compos_id <= 0) continue;
      const key = `${p.session_type}:${p.compos_id}`;
      const existing = byKey.get(key);
      // 같은 자리에 사진이 여러 장이면(중복) 가장 먼저 생성된 사진 하나만 크롭 대상으로 삼는다.
      if (!existing || p.photo_id < existing.photo_id) byKey.set(key, p);
    }
    const pairing = getSetPairing(mode);
    const units: CropUnit[] = [];
    for (const [beforeType, afterType] of pairing) {
      for (const [composId] of COMPOS) {
        const beforePhoto = byKey.get(`${beforeType}:${composId}`) ?? null;
        const afterPhoto = byKey.get(`${afterType}:${composId}`) ?? null;
        if (!beforePhoto && !afterPhoto) continue;
        units.push({ composId, beforeType, afterType, beforePhoto, afterPhoto });
      }
    }
    return units;
  }, [allPhotos, mode]);

  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!previewOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  const [unitIndex, setUnitIndex] = useState<number | null>(null);
  useEffect(() => {
    if (unitIndex === null && cropUnits.length > 0) {
      const idx = cropUnits.findIndex(
        (u) => (u.beforePhoto && !u.beforePhoto.manually_confirmed) || (u.afterPhoto && !u.afterPhoto.manually_confirmed),
      );
      setUnitIndex(idx === -1 ? cropUnits.length - 1 : idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropUnits.length]);

  const currentUnit = unitIndex !== null ? (cropUnits[unitIndex] ?? null) : null;
  const currentPhotos = useMemo(
    () => [currentUnit?.beforePhoto, currentUnit?.afterPhoto].filter((p): p is PhotoOut => !!p),
    [currentUnit],
  );

  // 유닛을 바꿀 때만 편집 상태를 서버 값으로 재시드한다.
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  useEffect(() => {
    if (!currentUnit) return;
    const next: Record<string, EditState> = {};
    for (const p of currentPhotos) {
      next[p.photo_id] = { rotationDeg: p.rotation_deg, cropBox: p.crop_box };
    }
    setEdits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIndex]);

  function handleBoxChange(photoId: string, box: CropBox) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], cropBox: box } } : prev));
  }

  // 사용자가 실제로 드래그해서 크기를 바꿨을 때 같은 유닛의 다른 사진에도 반영한다. 두 사진의
  // 원본 이미지 픽셀 크기가 같으면(같은 카메라/구도로 찍은 전-후 사진이라 사실상 정렬돼 있는
  // 경우) 크롭박스를 그대로 동일하게 맞추고, 크기가 다르면(촬영 거리가 달라 인물 크기가 다를
  // 수 있음) 반대쪽 사진 자체의 크롭 크기(면적)는 유지한 채 가로세로 비율만 맞춘다.
  function handleUserResize(photoId: string, box: CropBox) {
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    const ratio = w / h;
    const sourcePhoto = currentPhotos.find((p) => p.photo_id === photoId);
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of currentPhotos) {
        if (p.photo_id === photoId || !next[p.photo_id]) continue;
        const sameSize =
          !!sourcePhoto && sourcePhoto.width > 0 && p.width === sourcePhoto.width && p.height === sourcePhoto.height;
        next[p.photo_id] = {
          ...next[p.photo_id],
          cropBox: sameSize
            ? resizeBoxKeepingCenter(next[p.photo_id].cropBox, w, h)
            : applyRatioKeepingArea(next[p.photo_id].cropBox, ratio),
        };
      }
      return next;
    });
  }

  function handleRotationChange(photoId: string, deg: number) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], rotationDeg: deg } } : prev));
  }

  if (photosQuery.isLoading) return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;
  if (allPhotos.length === 0) {
    return <p className="py-8 text-sm text-neutral-500">업로드된 사진이 없습니다. 이전 단계로 돌아가주세요.</p>;
  }
  if (cropUnits.length === 0) {
    return (
      <p className="py-8 text-sm text-neutral-500">
        아직 구도가 확정된 사진이 없습니다. 이전 단계(옵션 선택)로 돌아가주세요.
      </p>
    );
  }

  const confirmedUnitCount = cropUnits.filter((u) =>
    [u.beforePhoto, u.afterPhoto].every((p) => !p || p.manually_confirmed),
  ).length;
  const isLastUnit = unitIndex !== null && unitIndex >= cropUnits.length - 1;

  async function saveCurrentUnit() {
    for (const p of currentPhotos) {
      const edit = edits[p.photo_id];
      if (!edit) continue;
      // sync_size:false - 전/후 크기 동기화는 이미 프론트에서(비율만) 처리했으므로, 백엔드가
      // 같은 구도의 다른 사진 crop_box를 픽셀 크기까지 통일해버리지 않게 막는다.
      await patchPhoto.mutateAsync({
        photoId: p.photo_id,
        patch: { rotation_deg: edit.rotationDeg, crop_box: edit.cropBox, manually_confirmed: true, sync_size: false },
      });
    }
    if (isLastUnit) {
      navigate(`/s/${sessionId}/match`);
    } else {
      setUnitIndex((i) => (i === null ? null : i + 1));
    }
  }

  function handlePrev() {
    setUnitIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  }

  if (!currentUnit) return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {confirmedUnitCount} / {cropUnits.length}쌍 확인 완료
          <span className="ml-2 text-neutral-400">
            (현재 {unitIndex! + 1} / {cropUnits.length} - {currentUnit.composId}.{" "}
            {COMPOS.find(([id]) => id === currentUnit.composId)?.[1]})
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPreviewOpen(true)} className="text-xs text-neutral-500 underline">
            PPT 미리보기
          </button>
          <button type="button" onClick={toggleGuideOverlay} className="text-xs text-neutral-500 underline">
            가이드 오버레이 {guideOverlayVisible ? "숨기기" : "보이기"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl bg-neutral-50 p-1.5">
        {cropUnits.map((u, idx) => {
          const confirmed = [u.beforePhoto, u.afterPhoto].every((p) => !p || p.manually_confirmed);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setUnitIndex(idx)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                idx === unitIndex
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-neutral-300 text-neutral-600"
              }`}
            >
              {idx + 1}
              {confirmed && " ✓"}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {([
          [currentUnit.beforeType, currentUnit.beforePhoto],
          [currentUnit.afterType, currentUnit.afterPhoto],
        ] as const).map(([sessionType, photo]) => {
          if (!photo) {
            return (
              <div
                key={sessionType}
                className="flex flex-col gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3"
              >
                <h3 className="text-sm font-semibold text-neutral-500">{SESSION_TYPE_LABEL[sessionType]}</h3>
                <p className="text-xs text-neutral-400">이 구도엔 이 세션타입 사진이 없습니다.</p>
              </div>
            );
          }
          const edit = edits[photo.photo_id];
          if (!edit) return null;
          const guideImg = getGuideImageUrl(photo.compos_id, sideForSessionType(photo.session_type));
          return (
            <div key={photo.photo_id} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {guideImg && (
                    <img
                      src={guideImg}
                      alt="예시 사진"
                      className="h-10 w-10 rounded border border-neutral-200 object-cover"
                    />
                  )}
                  <h3 className="text-sm font-semibold text-neutral-700">{SESSION_TYPE_LABEL[sessionType]}</h3>
                </div>
                {photo.manually_confirmed && <span className="text-xs text-emerald-600">✓ 확인됨</span>}
              </div>
              <CropCanvas
                photo={photo}
                rotationDeg={edit.rotationDeg}
                cropBox={edit.cropBox}
                guideOverlayVisible={guideOverlayVisible}
                onBoxChange={(box) => handleBoxChange(photo.photo_id, box)}
                onUserResize={(box) => handleUserResize(photo.photo_id, box)}
              />
              <AngleSlider
                value={edit.rotationDeg}
                onChange={(v) => handleRotationChange(photo.photo_id, v)}
                onCommit={(v) => handleRotationChange(photo.photo_id, v)}
              />
            </div>
          );
        })}
      </div>

      {/* "다음 쌍" 이동과 "다음 단계로" 이동을 서로 다른 버튼으로 확실히 구분한다 - 하나의
          버튼이 위치에 따라 라벨만 바뀌면 뭐가 눌리는지 헷갈린다는 피드백 반영. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handlePrev}
          disabled={unitIndex === 0}
          className="rounded-xl border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          ← 이전 쌍
        </button>
        {!isLastUnit && (
          <button
            type="button"
            onClick={saveCurrentUnit}
            disabled={patchPhoto.isPending}
            className="rounded-xl bg-brand-700 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {patchPhoto.isPending ? "저장 중..." : "다음 쌍 →"}
          </button>
        )}
      </div>

      {isLastUnit && (
        <button
          type="button"
          onClick={saveCurrentUnit}
          disabled={patchPhoto.isPending}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-600 px-5 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {patchPhoto.isPending ? "저장 중..." : "✓ 마지막 쌍 확인 완료 - 매칭 확인 단계로 이동"}
        </button>
      )}

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-neutral-700 shadow">
              <span>PPT 미리보기 - 지금 편집 중인 회전/크롭이 실제 슬라이드에 이렇게 들어갑니다.</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                닫기
              </button>
            </div>
            <PptSlidePreview
              composId={currentUnit.composId}
              beforePhoto={currentUnit.beforePhoto}
              afterPhoto={currentUnit.afterPhoto}
              beforeEdit={currentUnit.beforePhoto ? (edits[currentUnit.beforePhoto.photo_id] ?? null) : null}
              afterEdit={currentUnit.afterPhoto ? (edits[currentUnit.afterPhoto.photo_id] ?? null) : null}
              wide={WIDE_COMPOS.has(currentUnit.composId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
