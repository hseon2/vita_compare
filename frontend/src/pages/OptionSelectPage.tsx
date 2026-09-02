import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { COMPOS } from "../config/compos";
import { getGuideImageUrl, sideForSessionType } from "../config/guideImages";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";
import { useClassifyPhotos } from "../hooks/useClassifyPhotos";
import { useDeletePhoto } from "../hooks/useDeletePhoto";
import { useMovePhoto } from "../hooks/useMovePhoto";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { usePhotos } from "../hooks/usePhotos";
import { useUploadPhotos } from "../hooks/useUploadPhotos";
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
  const deletePhoto = useDeletePhoto(sessionId!);
  const movePhoto = useMovePhoto(sessionId!);
  const uploadPhotos = useUploadPhotos(sessionId!);
  const addFileInputRef = useRef<HTMLInputElement>(null);

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

  const [saveError, setSaveError] = useState<string | null>(null);
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

  // 구도 변경 저장은 내부적으로 포즈 재검출+크롭 재계산까지 도는 느린 비동기 작업이라, 옵션을
  // 연달아 여러 번 클릭하면 나중에 시작한 저장이 먼저 끝나버려 결과적으로 "제일 처음 클릭한
  // 값"이 최종적으로 남는 레이스가 있었다(실사용 중 발견). 클릭이 잠시 멈춘 뒤 마지막 선택
  // 하나만 저장되도록 디바운스한다.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

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

  function scheduleSave(sessionType: SessionType, composId: number) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveOption(sessionType, composId);
    }, 400);
  }

  function selectSessionType(st: SessionType) {
    setEditSessionType(st);
    scheduleSave(st, editComposId);
  }

  function selectComposId(composId: number) {
    setEditComposId(composId);
    if (editSessionType) scheduleSave(editSessionType, composId);
  }

  async function handleNext() {
    if (!currentPhoto || !editSessionType || editComposId <= 0) return;
    // 대기 중인 디바운스 저장이 있으면 취소한다 - 어차피 바로 아래에서 최신값으로 다시 저장한다.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveError(null);
    try {
      // 옵션 클릭 시점에 이미 저장됐지만, 아무것도 안 바꾸고(AI 추천값 그대로) 바로 "다음"을
      // 누르는 경우를 위해 여기서도 한 번 더 저장한다(이미 같은 값이면 그대로 덮어써도 무해함).
      await patchPhoto.mutateAsync({
        photoId: currentPhoto.photo_id,
        patch: { session_type: editSessionType, compos_id: editComposId, option_confirmed: true },
      });
    } catch (e) {
      // 예전엔 여기서 저장이 실패하면(예: 특이한 이미지 포맷) 그냥 아무 일도 안 일어나서
      // "다음 버튼이 안 눌린다"처럼 보였다(실사용 중 발견) - 이제는 이유를 화면에 보여준다.
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다. 다시 시도해주세요.");
      return;
    }
    if (isLastPhoto) {
      navigate(`/s/${sessionId}/crop`);
    } else {
      setViewIndex((i) => (i === null ? null : i + 1));
    }
  }

  function handlePrev() {
    setSaveError(null);
    setViewIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  }

  // 갤러리 썸네일을 클릭해 바로 그 사진으로 이동한다. 옵션 변경은 이제 클릭 즉시 저장되므로
  // 이동 자체도 별도 확인 없이 안전하다.
  function jumpTo(photoId: string) {
    setSaveError(null);
    const idx = reviewQueue.findIndex((p) => p.photo_id === photoId);
    if (idx !== -1) setViewIndex(idx);
  }

  function handleDeletePhoto(photoId: string) {
    if (!window.confirm("정말 삭제하시겠어요?")) return;
    deletePhoto.mutate(photoId);
    // 지금 보고 있는 사진이 삭제되면 목록이 줄어들며 인덱스가 밀릴 수 있으니, 다음 refetch 때
    // 재계산되도록 뷰 인덱스를 초기화한다(재조회 이펙트가 알아서 적절한 위치를 다시 잡는다).
    if (currentPhoto?.photo_id === photoId) setViewIndex(null);
  }

  async function handleAddFiles(files: File[]) {
    if (files.length === 0 || !currentPhoto) return;
    await uploadPhotos.mutateAsync({ sessionType: currentPhoto.session_type, sessionDate: null, files });
    classifyPhotos.mutate();
  }

  if (!currentPhoto || !editSessionType) {
    return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;
  }

  const passPhotos = reviewQueue.filter((p) => p.session_type === currentPhoto.session_type);
  const passIndex = passPhotos.findIndex((p) => p.photo_id === currentPhoto.photo_id) + 1;
  // 저장하려는(=editSessionType) pass에 이미 다른 사진이 같은 구도로 확정돼 있는지 - 예전엔
  // 이걸로 버튼을 아예 막았는데, AI가 서로 다른 사진 여러 장을 같은 구도로 추천하는 경우
  // (드물지 않음) 사용자가 고를 수 있는 번호가 하나도 안 남아 "다음"이 영영 안 눌리는
  // 막다른 골목이 됐다(실사용 중 발견). 이제는 경고만 하고 진행은 막지 않는다 - 중복은
  // 크롭 단계에서도 이미 관대하게 처리한다(같은 자리엔 먼저 확정된 사진 하나만 사용).
  const duplicateConflict = allPhotos.some(
    (p) =>
      p.photo_id !== currentPhoto.photo_id &&
      p.session_type === editSessionType &&
      p.option_confirmed &&
      p.compos_id === editComposId,
  );
  const canAdvance = !!editSessionType && editComposId > 0;

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[9fr_11fr] lg:items-start lg:gap-4">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="text-lg font-bold text-neutral-800">각 사진을 확인한 후 구도를 선택해주세요.</p>
          <p className="mt-1 text-xs text-red-500">
            시스템이 1차로 촬영 시점·구도를 자동 선택해뒀어요. 다르면 오른쪽에서 직접 골라주세요.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            <span className="font-bold text-neutral-700">{SESSION_TYPE_LABEL[currentPhoto.session_type]}</span>{" "}
            {passIndex} / {passPhotos.length}
            <span className="ml-2 text-xs text-neutral-400">
              (전체 {viewIndex! + 1} / {reviewQueue.length})
            </span>
          </p>
          {classifyPhotos.isPending && (
            <p className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-600" />
              AI 분류 진행 중...
            </p>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {passPhotos.map((p) => (
            <div key={p.photo_id} className="group relative h-16 w-16 shrink-0">
              <button
                type="button"
                onClick={() => jumpTo(p.photo_id)}
                className={`h-full w-full overflow-hidden rounded-lg border-2 bg-neutral-100 ${
                  p.photo_id === currentPhoto.photo_id ? "border-brand-700" : "border-transparent"
                }`}
              >
                <img src={p.thumbnail_url} alt="" className="h-full w-full object-contain" />
              </button>
              {p.option_confirmed && (
                <span className="pointer-events-none absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow transition-opacity group-hover:opacity-0">
                  ✓
                </span>
              )}
              {/* 마우스오버 시에만 삭제 버튼 노출 - 평소엔 확인 체크마크가 그 자리를 대신 보여준다. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePhoto(p.photo_id);
                }}
                className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                aria-label="사진 삭제"
              >
                ✕
              </button>
              {/* 촬영일 자동 정렬이 실제 순서와 어긋날 때 사람이 직접 순서를 바로잡을 수 있게 한다. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  movePhoto.mutate({ photoId: p.photo_id, direction: "prev" });
                }}
                disabled={passPhotos[0]?.photo_id === p.photo_id}
                className="absolute bottom-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 disabled:hidden"
                aria-label="앞으로 이동"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  movePhoto.mutate({ photoId: p.photo_id, direction: "next" });
                }}
                disabled={passPhotos[passPhotos.length - 1]?.photo_id === p.photo_id}
                className="absolute right-0.5 bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 disabled:hidden"
                aria-label="뒤로 이동"
              >
                ›
              </button>
            </div>
          ))}
          {/* 옵션 선택 화면에서도 바로 사진을 추가할 수 있게 한다 - 업로드 화면으로 돌아가지
              않아도 빠진 사진을 채워 넣을 수 있다. */}
          <button
            type="button"
            onClick={() => addFileInputRef.current?.click()}
            disabled={uploadPhotos.isPending}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-lg text-neutral-400 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
            aria-label="사진 추가"
          >
            {uploadPhotos.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-600" />
            ) : (
              "+"
            )}
          </button>
          <input
            ref={addFileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) await handleAddFiles(files);
            }}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
          {/* 모바일에서는 세로 공간을 너무 많이 잡아먹어서(aspect-3/4 그대로면 화면 대부분을
              차지) 높이를 제한해 절반 정도로 줄인다 - 큰 화면(sm 이상)에서는 원래대로. */}
          {/* 큰 화면에서도 이 미리보기가 오른쪽 사이드바(구도 옵션+버튼)보다 커지지 않게 높이를
              고정해서, 세로 스크롤 없이 두 영역이 한 화면에 같이 들어오게 한다. */}
          <div className="relative mx-auto aspect-3/4 max-h-[26vh] w-full max-w-[220px] overflow-hidden rounded-xl bg-neutral-100">
            <img
              src={currentPhoto.thumbnail_url}
              alt={currentPhoto.original_filename}
              className="h-full w-full object-contain"
            />
            {/* classifyPhotos.isPending(전체 배치 상태)이 아니라 이 사진 자체가 아직
                분류되지 않았는지(compos_id 없음)로 판단한다 - 배치가 빨리 끝나버리면 첫 사진
                말고는 이 안내가 안 뜨는 것처럼 보이는 문제가 있었다. */}
            {currentPhoto.compos_id <= 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-[1px]">
                <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-neutral-300 border-t-brand-600" />
                <span className="text-xs font-medium text-neutral-600">AI가 구도를 분석하고 있어요...</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="min-w-0 line-clamp-2 text-xs font-medium text-neutral-600">{currentPhoto.original_filename}</span>
            <ConfidenceBadge
              confidence={currentPhoto.classification_confidence}
              lowConfidence={currentPhoto.low_confidence}
              poseError={currentPhoto.pose_error}
              manuallyConfirmed={currentPhoto.option_confirmed}
            />
          </div>

          {saveError && (
            <p className="rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">{saveError}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={viewIndex === 0}
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 disabled:opacity-40"
            >
              ← 이전 사진
            </button>
            {!isLastPhoto && (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance || patchPhoto.isPending}
                className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
              >
                다음 사진 →
              </button>
            )}
          </div>
          {isLastPhoto && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance || patchPhoto.isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              ✓ 마지막 사진 확인 완료 - 크롭 단계로 이동
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(`/s/${sessionId}/upload`)}
          className="self-start text-xs text-neutral-600 underline hover:text-neutral-800"
        >
          ← 이전 단계로 돌아가기
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
        <aside className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
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
      </aside>

      <aside className="flex w-full flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-neutral-500">
            구도 (1~16) - {SESSION_TYPE_LABEL[editSessionType]} 현황
          </span>
          {/* 전면/측면/후면을 각각 한 줄에 다 들어오게 묶어서(6/4/6개) 총 3줄로 만든다 -
              기존 4x4 그리드(4줄)보다 한 줄 줄어들고, 그룹별로도 한눈에 훑기 쉬워진다. */}
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["전면", COMPOS.slice(0, 6)],
                ["측면", COMPOS.slice(6, 10)],
                ["후면", COMPOS.slice(10, 16)],
              ] as Array<[string, typeof COMPOS]>
            ).map(([rowLabel, row]) => (
              <div key={rowLabel} className="flex flex-col gap-1">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {rowLabel}
                </span>
                <div className="grid grid-cols-6 gap-1">
                {row.map(([composId, label]) => {
                  const guideImg = getGuideImageUrl(composId, sideForSessionType(editSessionType));
                  const selected = composId === editComposId;
                  const confirmedPhoto = allPhotos.find(
                    (p) => p.session_type === editSessionType && p.option_confirmed && p.compos_id === composId,
                  );
                  // 이미 다른 사진이 이 번호로 확정돼 있는지 표시만 한다 - 예전엔 아예 못 고르게
                  // 막았는데, AI가 여러 사진을 같은 구도로 추천하면 고를 수 있는 번호가 하나도
                  // 안 남아 진행이 막히는 막다른 골목이 됐다(실사용 중 발견). 지금 편집 중인 사진
                  // 자신이 이미 이 번호로 확정된 경우(재확인)는 "타 사진 사용 중" 표시에서 제외.
                  const takenByOther = !!confirmedPhoto && confirmedPhoto.photo_id !== currentPhoto.photo_id;
                  return (
                    <button
                      key={composId}
                      type="button"
                      title={takenByOther ? `${composId}. ${label} (이미 다른 사진에 배정됨 - 그래도 선택 가능)` : `${composId}. ${label}`}
                      onClick={() => selectComposId(composId)}
                      className={`flex flex-col items-center gap-[3px] rounded-lg border px-[3px] py-[5px] transition-all ${
                        selected
                          ? "border-[3px] border-brand-700 bg-brand-50 ring-2 ring-brand-200"
                          : takenByOther
                            ? "border-amber-300 bg-amber-50/60 hover:bg-amber-50"
                            : "border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      <span
                        className={`line-clamp-2 w-full text-center text-[13px] leading-tight font-bold ${
                          selected ? "text-brand-800" : "text-neutral-600"
                        }`}
                      >
                        {composId}. {label.split("_")[1] ?? label}
                      </span>
                      <div className="relative mx-auto aspect-3/4 w-[68%] overflow-hidden rounded bg-neutral-100">
                        {confirmedPhoto ? (
                          <img
                            key={confirmedPhoto.thumbnail_url}
                            src={confirmedPhoto.thumbnail_url}
                            alt={label}
                            className="h-full w-full animate-[fadein_0.2s_ease-out_forwards] object-contain"
                          />
                        ) : guideImg ? (
                          <img
                            key={guideImg}
                            src={guideImg}
                            alt={label}
                            className="h-full w-full animate-[fadein-dim_0.2s_ease-out_forwards] object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-300">
                            {composId}
                          </div>
                        )}
                        {confirmedPhoto && (
                          <span className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white shadow">
                            ✓
                          </span>
                        )}
                        {/* 옵션을 고른 직후 저장(디바운스)이 끝날 때까지 이 칸에 로딩 표시 -
                            선택 후 썸네일이 바뀌는 게 렉처럼 느껴진다는 피드백 반영. */}
                        {selected && patchPhoto.isPending && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-600" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {duplicateConflict && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
            이미 다른 사진이 이 구도로 확정돼 있어요. 그대로 진행하면 크롭 단계에서 먼저 확정된 사진이 우선 사용돼요.
          </p>
        )}
      </aside>
      </div>
      </div>
    </div>
  );
}
