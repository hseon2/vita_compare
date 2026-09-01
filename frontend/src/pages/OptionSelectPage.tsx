import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { COMPOS } from "../config/compos";
import { getGuideImageUrl, sideForSessionType } from "../config/guideImages";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";
import { useClassifyPhotos } from "../hooks/useClassifyPhotos";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { usePhotos } from "../hooks/usePhotos";
import { deriveModeFromPhotos, sessionTypesForMode } from "../utils/derive";
import type { SessionType } from "../api/types";

// 사진을 1장씩 순차로 보여주며 (a) before/interim/after 세션타입과 (b) 1~16번 구도를 확정하는
// 화면. 두 값 모두 업로드/AI분류로 이미 채워진 초기값이 있고, 사람은 확인하거나 바로잡기만 하면
// 된다 - "다음"을 누르면 그 값이 서버에 저장되고 다음 사진으로 넘어간다.
export function OptionSelectPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const patchPhoto = usePatchPhoto(sessionId!);
  const classifyPhotos = useClassifyPhotos(sessionId!);

  const allPhotos = useMemo(() => photosQuery.data?.photos ?? [], [photosQuery.data]);
  const mode = photosQuery.data ? deriveModeFromPhotos(photosQuery.data) : "standard";
  const passOrder = useMemo(() => sessionTypesForMode(mode), [mode]);

  // 업로드 직후엔 전 사진이 미분류 상태다 - 진입 시 한 번 자동분류를 돌려 구도/신뢰도/회전/
  // 1차크롭을 미리 채워둔다. 이미 확정된(option_confirmed) 사진은 백엔드가 건너뛰므로 몇 번을
  // 다시 호출해도 안전하지만, 화면 안에서는 마운트당 한 번만 트리거한다.
  const triggeredClassifyRef = useRef(false);
  useEffect(() => {
    if (triggeredClassifyRef.current) return;
    if (photosQuery.data && photosQuery.data.photos.some((p) => !p.option_confirmed)) {
      triggeredClassifyRef.current = true;
      classifyPhotos.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosQuery.data]);

  // 리뷰 순서: before(시작) 전체 -> (장기모드면 interim) -> after(종료) 전체. pass 내부 순서는
  // 서버가 준 목록 순서(업로드 순서) 그대로 사용한다.
  const reviewQueue = useMemo(
    () => passOrder.flatMap((st) => allPhotos.filter((p) => p.session_type === st)),
    [allPhotos, passOrder],
  );

  const [viewIndex, setViewIndex] = useState<number | null>(null);
  useEffect(() => {
    if (viewIndex === null && reviewQueue.length > 0) {
      const firstUnconfirmed = reviewQueue.findIndex((p) => !p.option_confirmed);
      setViewIndex(firstUnconfirmed === -1 ? reviewQueue.length - 1 : firstUnconfirmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewQueue.length]);

  const currentPhoto = viewIndex !== null ? (reviewQueue[viewIndex] ?? null) : null;

  const [editSessionType, setEditSessionType] = useState<SessionType | null>(null);
  const [editComposId, setEditComposId] = useState<number>(0);
  useEffect(() => {
    if (currentPhoto) {
      setEditSessionType(currentPhoto.session_type);
      setEditComposId(currentPhoto.compos_id);
    }
    // photo_id뿐 아니라 compos_id도 같이 봐야 한다 - 이 사진이 아직 자동분류 전이라
    // compos_id=0인 상태로 먼저 마운트된 뒤, 백그라운드로 돌던 classify가 나중에 끝나
    // compos_id가 채워지는 경우(예: "확인 필요" 낮은 신뢰도로 분류된 사진)에도 선택 버튼에
    // 반영되어야 하기 때문. 편집 중인 값은 "다음"을 눌러야만 서버에 저장되므로, 같은 사진을
    // 보고 있는 동안 이 값이 바뀌는 건 classify 결과가 늦게 도착한 경우뿐이라 안전하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhoto?.photo_id, currentPhoto?.compos_id, currentPhoto?.session_type]);

  if (photosQuery.isLoading) return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;
  if (allPhotos.length === 0) {
    return <p className="py-8 text-sm text-neutral-500">업로드된 사진이 없습니다. 이전 단계로 돌아가주세요.</p>;
  }

  const isLastPhoto = viewIndex !== null && viewIndex >= reviewQueue.length - 1;

  // 촬영시점/구도 버튼을 누르는 즉시 저장한다 - "다음"을 눌러야만 저장되면, 필름스트립으로
  // 이미 확정된 사진을 다시 봤다가 옵션만 바꾸고 다른 사진으로 넘어갔을 때 변경이 사라지는
  // 문제가 있었다.
  function saveOption(sessionType: SessionType, composId: number) {
    if (!currentPhoto || composId <= 0) return;
    patchPhoto.mutate({
      photoId: currentPhoto.photo_id,
      patch: { session_type: sessionType, compos_id: composId, option_confirmed: true },
    });
  }

  function selectSessionType(st: SessionType) {
    setEditSessionType(st);
    saveOption(st, editComposId);
  }

  function selectComposId(composId: number) {
    setEditComposId(composId);
    if (editSessionType) saveOption(editSessionType, composId);
  }

  async function handleNext() {
    if (!currentPhoto || !editSessionType || editComposId <= 0) return;
    // 옵션 클릭 시점에 이미 저장됐지만, 아무것도 안 바꾸고(AI 추천값 그대로) 바로 "다음"을
    // 누르는 경우를 위해 여기서도 한 번 더 저장한다(이미 같은 값이면 그대로 덮어써도 무해함).
    await patchPhoto.mutateAsync({
      photoId: currentPhoto.photo_id,
      patch: { session_type: editSessionType, compos_id: editComposId, option_confirmed: true },
    });
    if (isLastPhoto) {
      navigate(`/s/${sessionId}/crop`);
    } else {
      setViewIndex((i) => (i === null ? null : i + 1));
    }
  }

  function handlePrev() {
    setViewIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  }

  // 갤러리 썸네일을 클릭해 바로 그 사진으로 이동한다. 옵션 변경은 이제 클릭 즉시 저장되므로
  // 이동 자체도 별도 확인 없이 안전하다.
  function jumpTo(photoId: string) {
    const idx = reviewQueue.findIndex((p) => p.photo_id === photoId);
    if (idx !== -1) setViewIndex(idx);
  }

  if (!currentPhoto || !editSessionType) {
    return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;
  }

  const passPhotos = reviewQueue.filter((p) => p.session_type === currentPhoto.session_type);
  const passIndex = passPhotos.findIndex((p) => p.photo_id === currentPhoto.photo_id) + 1;
  // 저장하려는(=editSessionType) pass에 이미 다른 사진이 같은 구도로 확정돼 있으면 저장을 막는다.
  const duplicateConflict = allPhotos.some(
    (p) =>
      p.photo_id !== currentPhoto.photo_id &&
      p.session_type === editSessionType &&
      p.option_confirmed &&
      p.compos_id === editComposId,
  );
  const canAdvance = !!editSessionType && editComposId > 0 && !duplicateConflict;

  return (
    <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            {SESSION_TYPE_LABEL[currentPhoto.session_type]} {passIndex} / {passPhotos.length}
            <span className="ml-2 text-xs text-neutral-400">
              (전체 {viewIndex! + 1} / {reviewQueue.length})
            </span>
          </p>
          {classifyPhotos.isPending && <p className="text-xs text-neutral-400">AI 분류 진행 중...</p>}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {passPhotos.map((p) => (
            <button
              key={p.photo_id}
              type="button"
              onClick={() => jumpTo(p.photo_id)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-neutral-100 ${
                p.photo_id === currentPhoto.photo_id ? "border-brand-700" : "border-transparent"
              }`}
            >
              <img src={p.thumbnail_url} alt="" className="h-full w-full object-contain" />
              {p.option_confirmed && (
                <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
          <div className="relative mx-auto aspect-3/4 w-full max-w-sm overflow-hidden rounded-xl bg-neutral-100">
            <img
              src={currentPhoto.thumbnail_url}
              alt={currentPhoto.original_filename}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-neutral-400">{currentPhoto.original_filename}</span>
            <ConfidenceBadge
              confidence={currentPhoto.classification_confidence}
              lowConfidence={currentPhoto.low_confidence}
              poseError={currentPhoto.pose_error}
              manuallyConfirmed={currentPhoto.option_confirmed}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={viewIndex === 0}
            className="rounded-xl border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance || patchPhoto.isPending}
            className="rounded-xl bg-brand-700 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {patchPhoto.isPending ? "저장 중..." : isLastPhoto ? "다음: 크롭 →" : "다음 →"}
          </button>
        </div>
      </div>

      <aside className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm lg:sticky lg:top-4 lg:w-96 lg:shrink-0">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-neutral-500">촬영 시점</span>
          <div className="flex gap-2">
            {passOrder.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => selectSessionType(st)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                  editSessionType === st
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-neutral-300 text-neutral-600"
                }`}
              >
                {SESSION_TYPE_LABEL[st]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-neutral-500">
            구도 (1~16) - {SESSION_TYPE_LABEL[editSessionType]} 현황
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {COMPOS.map(([composId, label]) => {
              const guideImg = getGuideImageUrl(composId, sideForSessionType(editSessionType));
              const selected = composId === editComposId;
              const confirmedPhoto = allPhotos.find(
                (p) => p.session_type === editSessionType && p.option_confirmed && p.compos_id === composId,
              );
              // 이미 다른 사진이 이 번호로 확정돼 있으면 중복 배정을 막는다 - 지금 편집 중인
              // 사진 자신이 이미 이 번호로 확정된 경우(재확인)는 예외로 허용한다.
              const takenByOther = !!confirmedPhoto && confirmedPhoto.photo_id !== currentPhoto.photo_id;
              return (
                <button
                  key={composId}
                  type="button"
                  title={takenByOther ? `${composId}. ${label} (이미 다른 사진에 배정됨)` : `${composId}. ${label}`}
                  disabled={takenByOther}
                  onClick={() => selectComposId(composId)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1 ${
                    selected
                      ? "border-brand-700 bg-brand-50"
                      : takenByOther
                        ? "cursor-not-allowed border-neutral-200 opacity-40"
                        : "border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  <div className="relative aspect-3/4 w-full overflow-hidden rounded bg-neutral-100">
                    {confirmedPhoto ? (
                      <img
                        src={confirmedPhoto.thumbnail_url}
                        alt={label}
                        className="h-full w-full object-contain"
                      />
                    ) : guideImg ? (
                      <img src={guideImg} alt={label} className="h-full w-full object-cover opacity-60" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-300">
                        {composId}
                      </div>
                    )}
                    {confirmedPhoto && (
                      <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow">
                        ✓
                      </span>
                    )}
                  </div>
                  <span
                    className={`line-clamp-2 text-center text-[11px] leading-tight ${
                      selected ? "font-semibold text-brand-800" : "text-neutral-500"
                    }`}
                  >
                    {composId}. {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
