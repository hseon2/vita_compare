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
import { deriveModeFromPhotos, getSetPairing, sortPhotoCandidates } from "../utils/derive";
import { applyRatioKeepingArea } from "../utils/cropCoords";
import type { CropBox, PhotoOut, SessionType } from "../api/types";

interface EditState {
  rotationDeg: number;
  cropBox: CropBox;
  // PPT 슬라이드 안에서 이 사진이 표시될 크기 배율 (1.0 = 화면 꽉 차게 자동 맞춤).
  slideScale: number;
}

interface CropUnit {
  composId: number;
  beforeType: SessionType;
  afterType: SessionType;
  // 같은 자리(세션타입+구도)에 사진이 여러 장(중복) 배정될 수 있어 배열로 들고, 화살표로
  // 넘겨보게 한다 - 예전엔 가장 먼저 생성된 사진 하나만 남기고 나머지는 그냥 버렸다.
  beforeCandidates: PhotoOut[];
  afterCandidates: PhotoOut[];
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
    const bySlot = new Map<string, PhotoOut[]>();
    for (const p of allPhotos) {
      if (p.compos_id <= 0) continue;
      const key = `${p.session_type}:${p.compos_id}`;
      const arr = bySlot.get(key) ?? [];
      arr.push(p);
      bySlot.set(key, arr);
    }
    const pairing = getSetPairing(mode);
    const units: CropUnit[] = [];
    for (const [beforeType, afterType] of pairing) {
      for (const [composId] of COMPOS) {
        const beforeCandidates = sortPhotoCandidates(bySlot.get(`${beforeType}:${composId}`) ?? []);
        const afterCandidates = sortPhotoCandidates(bySlot.get(`${afterType}:${composId}`) ?? []);
        if (beforeCandidates.length === 0 && afterCandidates.length === 0) continue;
        units.push({ composId, beforeType, afterType, beforeCandidates, afterCandidates });
      }
    }
    return units;
  }, [allPhotos, mode]);

  // 상/하로 보기 - 좌우로 나란히 두면 사진이 좁아서 잘 안 보인다는 피드백 반영. 쌍을 넘겨도
  // 유지되는 화면 설정이라 유닛 인덱스와 달리 리셋하지 않는다.
  const [stackedLayout, setStackedLayout] = useState(false);
  const [unitIndex, setUnitIndex] = useState<number | null>(null);
  useEffect(() => {
    if (unitIndex === null && cropUnits.length > 0) {
      const idx = cropUnits.findIndex(
        (u) =>
          (u.beforeCandidates[0] && !u.beforeCandidates[0].manually_confirmed) ||
          (u.afterCandidates[0] && !u.afterCandidates[0].manually_confirmed),
      );
      setUnitIndex(idx === -1 ? cropUnits.length - 1 : idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropUnits.length]);

  const currentUnit = unitIndex !== null ? (cropUnits[unitIndex] ?? null) : null;

  // 중복 후보 중 지금 화면에 보여줄 사진의 인덱스 - 유닛이 바뀌면 각각 0(=대표 사진)으로 되돌린다.
  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(0);
  // 가로세로 비율 고정 - 기본은 꺼짐(양쪽이 서로 다른 배율로 찍혔을 때 한쪽만 미세조정하기
  // 힘들다는 피드백 반영, 예전엔 항상 픽셀 크기까지 강제로 맞췄다). before/after 중 한쪽에서
  // "비율 고정"을 누르면 그 순간 그쪽의 가로세로 비율을 반대쪽에도 즉시 맞추고, 그 뒤로는
  // 어느 쪽을 조절하든 이 비율을 유지한다(크기·면적은 각자 자유롭게 조절 가능 - 비율만 같다).
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);
  useEffect(() => {
    setBeforeIdx(0);
    setAfterIdx(0);
    setLockedRatio(null);
  }, [unitIndex]);

  const beforePhoto = currentUnit?.beforeCandidates[beforeIdx] ?? null;
  const afterPhoto = currentUnit?.afterCandidates[afterIdx] ?? null;
  const currentPhotos = useMemo(
    () => [beforePhoto, afterPhoto].filter((p): p is PhotoOut => !!p),
    [beforePhoto, afterPhoto],
  );

  // 유닛이나 보고 있는 후보가 바뀔 때 편집 상태를 서버 값으로 재시드한다.
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  useEffect(() => {
    if (currentPhotos.length === 0) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of currentPhotos) {
        if (!next[p.photo_id]) {
          next[p.photo_id] = { rotationDeg: p.rotation_deg, cropBox: p.crop_box, slideScale: p.slide_scale ?? 1 };
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIndex, beforeIdx, afterIdx]);

  // side 쪽 버튼을 눌렀을 때: 이미 그 비율로 고정돼 있으면 해제하고, 아니면 지금 side의
  // 가로세로 비율을 반대쪽에도 즉시 맞춘 뒤 그 비율로 고정한다.
  function toggleRatioLock(side: "before" | "after") {
    const sourcePhoto = side === "before" ? beforePhoto : afterPhoto;
    const otherPhoto = side === "before" ? afterPhoto : beforePhoto;
    if (!sourcePhoto) return;
    const sourceBox = edits[sourcePhoto.photo_id]?.cropBox;
    if (!sourceBox) return;
    const sw = sourceBox[2] - sourceBox[0];
    const sh = sourceBox[3] - sourceBox[1];
    if (sh <= 0) return;
    const ratio = sw / sh;

    setLockedRatio((current) => (current !== null && Math.abs(current - ratio) < 0.001 ? null : ratio));
    if (otherPhoto) {
      setEdits((prev) => {
        const ob = prev[otherPhoto.photo_id]?.cropBox;
        if (!ob) return prev;
        return {
          ...prev,
          [otherPhoto.photo_id]: { ...prev[otherPhoto.photo_id], cropBox: applyRatioKeepingArea(ob, ratio) },
        };
      });
    }
  }

  function handleBoxChange(photoId: string, box: CropBox) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], cropBox: box } } : prev));
  }

  // 비율이 고정돼 있을 때만 동작한다 - 꺼져 있으면 각자 독립적으로 크기(면적)와 모양 둘 다
  // 자유롭게 조절 가능(예전엔 항상 픽셀 크기까지 강제로 맞춰서, 두 사진의 촬영 배율이 다르면
  // 한쪽만 미세조정하기 어렵다는 피드백이 있었다). 켜져 있으면 드래그한 쪽 자신도, 반대쪽도
  // 각자의 면적(크기)은 유지한 채 모양(가로세로 비율)만 고정된 비율에 맞춘다.
  function handleUserResize(photoId: string, box: CropBox) {
    if (lockedRatio === null || !beforePhoto || !afterPhoto) return;
    const isBefore = photoId === beforePhoto.photo_id;
    const otherPhoto = isBefore ? afterPhoto : beforePhoto;
    setEdits((prev) => {
      const next = { ...prev };
      next[photoId] = { ...next[photoId], cropBox: applyRatioKeepingArea(box, lockedRatio) };
      const ob = next[otherPhoto.photo_id]?.cropBox;
      if (ob) {
        next[otherPhoto.photo_id] = { ...next[otherPhoto.photo_id], cropBox: applyRatioKeepingArea(ob, lockedRatio) };
      }
      return next;
    });
  }

  function handleRotationChange(photoId: string, deg: number) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], rotationDeg: deg } } : prev));
  }

  // 기본은 양쪽 크기가 같아야 하므로 슬라이더 하나로 시작일/종료일 둘 다 같이 조절한다.
  function handleSlideScaleChange(scale: number) {
    setEdits((prev) => {
      const next = { ...prev };
      if (beforePhoto && next[beforePhoto.photo_id]) {
        next[beforePhoto.photo_id] = { ...next[beforePhoto.photo_id], slideScale: scale };
      }
      if (afterPhoto && next[afterPhoto.photo_id]) {
        next[afterPhoto.photo_id] = { ...next[afterPhoto.photo_id], slideScale: scale };
      }
      return next;
    });
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
    [u.beforeCandidates[0], u.afterCandidates[0]].every((p) => !p || p.manually_confirmed),
  ).length;
  const isLastUnit = unitIndex !== null && unitIndex >= cropUnits.length - 1;

  async function saveCurrentUnit() {
    for (const p of currentPhotos) {
      const edit = edits[p.photo_id];
      if (!edit) continue;
      // sync_size:false - 전/후 크기 동기화는 이미 프론트에서 처리했으므로, 백엔드가
      // 같은 구도의 다른 사진 crop_box를 픽셀 크기까지 통일해버리지 않게 막는다.
      await patchPhoto.mutateAsync({
        photoId: p.photo_id,
        patch: {
          rotation_deg: edit.rotationDeg,
          crop_box: edit.cropBox,
          manually_confirmed: true,
          sync_size: false,
          slide_scale: edit.slideScale,
        },
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

  const currentComposLabel = COMPOS.find(([id]) => id === currentUnit.composId)?.[1] ?? "";
  const beforeGuideImg = getGuideImageUrl(currentUnit.composId, sideForSessionType(currentUnit.beforeType));
  const afterGuideImg = getGuideImageUrl(currentUnit.composId, sideForSessionType(currentUnit.afterType));

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-xs text-neutral-500">
          {confirmedUnitCount} / {cropUnits.length}쌍 확인 완료
          <span className="ml-2 text-neutral-400">(현재 {unitIndex! + 1} / {cropUnits.length})</span>
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
            <input
              type="checkbox"
              checked={stackedLayout}
              onChange={(e) => setStackedLayout(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 accent-brand-600"
            />
            상/하로 보기
          </label>
          <button type="button" onClick={toggleGuideOverlay} className="text-xs text-neutral-500 underline">
            가이드 오버레이 {guideOverlayVisible ? "숨기기" : "보이기"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-50 p-1">
        {cropUnits.map((u, idx) => {
          const confirmed = [u.beforeCandidates[0], u.afterCandidates[0]].every((p) => !p || p.manually_confirmed);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setUnitIndex(idx)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
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

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-4">
        {/* 좌측: PPT에 실제로 들어갈 모습 미리보기 - 예전엔 버튼을 눌러야 뜨는 모달이었는데,
            늘 옆에 두고 크롭하면서 바로바로 확인할 수 있게 상시 패널로 바꿨다. */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4">
          <p className="text-lg font-bold text-neutral-800">PPT에 삽입될 크기로 사진을 크롭해주세요.</p>
          <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-fit items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                PPT 미리보기
              </span>
              <span className="text-base font-extrabold text-neutral-800">
                {currentUnit.composId}. {currentComposLabel}
              </span>
            </div>
            <PptSlidePreview
              composId={currentUnit.composId}
              beforePhoto={beforePhoto}
              afterPhoto={afterPhoto}
              beforeEdit={beforePhoto ? (edits[beforePhoto.photo_id] ?? null) : null}
              afterEdit={afterPhoto ? (edits[afterPhoto.photo_id] ?? null) : null}
              wide={WIDE_COMPOS.has(currentUnit.composId)}
            />
            {/* PPT에 실제로 들어갈 이미지 크기 - 자동으로 꽉 채운 크기(100%)에서 이 배율만큼
                줄인다. 기본은 양쪽이 같은 크기여야 하므로 버튼 하나로 시작일/종료일을 같이
                조절하고, 위 미리보기로 결과를 바로 확인한다. 아래 회전 슬라이더(수평 보정
                각도)와 생김새가 헷갈린다는 피드백이 있어, 같은 range 슬라이더 대신 확대/축소
                버튼과 같은 +/− 스텝 컨트롤 형태로 만들었다. */}
            {(beforePhoto || afterPhoto) && (
              <div className="flex items-center gap-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                <span>PPT 이미지 크기 조정</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleSlideScaleChange(
                        Math.max(0.4, +((edits[(beforePhoto ?? afterPhoto)!.photo_id]?.slideScale ?? 1) - 0.05).toFixed(2)),
                      )
                    }
                    disabled={(edits[(beforePhoto ?? afterPhoto)!.photo_id]?.slideScale ?? 1) <= 0.4}
                    className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-sm leading-none text-neutral-600 disabled:opacity-30"
                    aria-label="이미지 크기 축소"
                  >
                    −
                  </button>
                  <span className="w-10 text-center tabular-nums">
                    {Math.round((edits[(beforePhoto ?? afterPhoto)!.photo_id]?.slideScale ?? 1) * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleSlideScaleChange(
                        Math.min(2, +((edits[(beforePhoto ?? afterPhoto)!.photo_id]?.slideScale ?? 1) + 0.05).toFixed(2)),
                      )
                    }
                    disabled={(edits[(beforePhoto ?? afterPhoto)!.photo_id]?.slideScale ?? 1) >= 2}
                    className="flex h-6 w-6 items-center justify-center rounded border border-neutral-300 text-sm leading-none text-neutral-600 disabled:opacity-30"
                    aria-label="이미지 크기 확대"
                  >
                    ＋
                  </button>
                </div>
              </div>
            )}
            {(beforeGuideImg || afterGuideImg) && (
              <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-neutral-400">예시 · {SESSION_TYPE_LABEL[currentUnit.beforeType]}</span>
                  {beforeGuideImg && (
                    <img src={beforeGuideImg} alt="시작일 예시" className="aspect-3/4 w-full rounded object-cover" />
                  )}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-neutral-400">예시 · {SESSION_TYPE_LABEL[currentUnit.afterType]}</span>
                  {afterGuideImg && (
                    <img src={afterGuideImg} alt="종료일 예시" className="aspect-3/4 w-full rounded object-cover" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 우측: 실제 크롭 조정 - 시작일/종료일 두 장. 상/하로 보기 체크 시 세로로 쌓아서
            사진 하나하나를 더 크게 볼 수 있게 한다. */}
        <div className={stackedLayout ? "flex flex-col items-center gap-4" : "grid grid-cols-2 justify-center gap-3 sm:gap-4"}>
          {(
            [
              [currentUnit.beforeType, beforePhoto, currentUnit.beforeCandidates, beforeIdx, setBeforeIdx, "before"],
              [currentUnit.afterType, afterPhoto, currentUnit.afterCandidates, afterIdx, setAfterIdx, "after"],
            ] as const
          ).map(([sessionType, photo, candidates, idx, setIdx, side]) => {
            // 시작일/종료일을 색으로도 구분되게 한다 - 둘 다 같은 보라색이라 한눈에 구별이
            // 안 된다는 피드백 반영.
            const tag = (
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  side === "before" ? "bg-brand-50 text-brand-700" : "bg-sky-50 text-sky-700"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${side === "before" ? "bg-brand-500" : "bg-sky-500"}`} />
                {SESSION_TYPE_LABEL[sessionType]}
              </span>
            );
            // 같은 자리에 사진이 여러 장(중복) 배정됐을 때만 화살표로 넘겨볼 수 있게 한다.
            const nav = candidates.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <button
                  type="button"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="flex h-5 w-5 items-center justify-center rounded border border-neutral-300 disabled:opacity-30"
                  aria-label="이전 사진"
                >
                  ‹
                </button>
                <span>
                  {idx + 1}/{candidates.length}
                </span>
                <button
                  type="button"
                  onClick={() => setIdx((i) => Math.min(candidates.length - 1, i + 1))}
                  disabled={idx === candidates.length - 1}
                  className="flex h-5 w-5 items-center justify-center rounded border border-neutral-300 disabled:opacity-30"
                  aria-label="다음 사진"
                >
                  ›
                </button>
              </div>
            );

            if (!photo) {
              return (
                <div
                  key={sessionType}
                  className={`mx-auto flex w-full flex-col gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3 ${
                    stackedLayout ? "max-w-[560px]" : "max-w-[380px]"
                  }`}
                >
                  {tag}
                  <p className="text-xs text-neutral-400">이 구도엔 이 세션타입 사진이 없습니다.</p>
                </div>
              );
            }
            const edit = edits[photo.photo_id];
            if (!edit) return null;
            return (
              <div
                key={sessionType}
                className={`mx-auto flex w-full flex-col gap-1.5 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm sm:p-3 ${
                  stackedLayout ? "max-w-[560px]" : "max-w-[380px]"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  {tag}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {beforePhoto && afterPhoto && (
                      <button
                        type="button"
                        onClick={() => toggleRatioLock(side)}
                        title={
                          lockedRatio !== null
                            ? "지금 가로세로 비율을 고정했어요. 다시 눌러 해제"
                            : "지금 이 사진의 가로세로 비율로 반대쪽도 맞춰 고정하려면 누르세요"
                        }
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                          lockedRatio !== null
                            ? "border-brand-700 bg-brand-700 text-white"
                            : "border-neutral-300 text-neutral-500 hover:bg-neutral-50"
                        }`}
                      >
                        {lockedRatio !== null ? "🔒 비율 고정 해제" : "🔓 비율 고정"}
                      </button>
                    )}
                    {nav}
                    {photo.manually_confirmed && <span className="text-xs text-emerald-600">✓</span>}
                  </div>
                </div>
                <CropCanvas
                  photo={photo}
                  rotationDeg={edit.rotationDeg}
                  cropBox={edit.cropBox}
                  guideOverlayVisible={guideOverlayVisible}
                  lockedAspect={lockedRatio ?? undefined}
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
      </div>

      {/* "다음 쌍" 이동과 "다음 단계로" 이동을 서로 다른 버튼으로 확실히 구분한다 - 하나의
          버튼이 위치에 따라 라벨만 바뀌면 뭐가 눌리는지 헷갈린다는 피드백 반영. sticky로
          바닥에 고정해 사진 카드 높이와 무관하게 스크롤 없이 항상 바로 눌리게 한다. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur">
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
            className="rounded-xl bg-brand-700 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {patchPhoto.isPending ? "저장 중..." : "다음 쌍 →"}
          </button>
        )}
        {isLastUnit && (
          <button
            type="button"
            onClick={saveCurrentUnit}
            disabled={patchPhoto.isPending}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-600 px-5 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {patchPhoto.isPending ? "저장 중..." : "✓ 마지막 쌍 확인 완료 - 매칭 확인 단계로 이동"}
          </button>
        )}
      </div>
    </div>
  );
}
