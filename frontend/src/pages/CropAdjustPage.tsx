import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AngleSlider } from "../components/AngleSlider";
import { CropCanvas } from "../components/CropCanvas";
import { PhotoThumbnail } from "../components/PhotoThumbnail";
import { UploadSlot } from "../components/UploadSlot";
import { COMPOS } from "../config/compos";
import { getGuideImageUrl, sideForSessionType } from "../config/guideImages";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { usePhotos } from "../hooks/usePhotos";
import { useUploadPhotos } from "../hooks/useUploadPhotos";
import { useWizardStore } from "../store/wizardStore";
import { deriveModeFromPhotos } from "../utils/derive";
import { resizeBoxKeepingCenter } from "../utils/cropCoords";
import type { CropBox, PhotoOut, SessionType } from "../api/types";

const SESSION_TYPE_ORDER = ["start", "mid", "end"];
const TODAY = new Date().toISOString().slice(0, 10);

interface EditState {
  rotationDeg: number;
  cropBox: CropBox;
}

export function CropAdjustPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const patchPhoto = usePatchPhoto(sessionId!);
  const uploadPhotos = useUploadPhotos(sessionId!);
  const { guideOverlayVisible, toggleGuideOverlay } = useWizardStore();

  const allPhotos = photosQuery.data?.photos ?? [];
  const classifiedPhotos = useMemo(() => allPhotos.filter((p) => p.compos_id > 0), [allPhotos]);
  const mode = photosQuery.data ? deriveModeFromPhotos(photosQuery.data) : "standard";

  // --- 갤러리: AI가 정한 구도를 사진별로 확인/재지정. 확정된 사진은 체크 배지로 표시된다
  //     (PhotoThumbnail 컴포넌트 참고). 처음엔 펼쳐두고, 크롭 작업에 집중하고 싶으면 접을 수 있다.
  const [galleryOpen, setGalleryOpen] = useState(true);
  // 이미 업로드/분류가 끝난 상태에서도 이 화면을 벗어나지 않고 사진을 추가로 더 올릴 수 있게 한다.
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [addingDates, setAddingDates] = useState<Record<SessionType, string>>({ start: TODAY, mid: TODAY, end: TODAY });
  const [uploadingSlot, setUploadingSlot] = useState<SessionType | null>(null);
  const [addPhotoError, setAddPhotoError] = useState<string | null>(null);
  const addSlots: SessionType[] = mode === "long" ? ["start", "mid", "end"] : ["start", "end"];
  const galleryGroups = useMemo(() => {
    const map = new Map<number, PhotoOut[]>();
    for (const p of allPhotos) {
      const arr = map.get(p.compos_id) ?? [];
      arr.push(p);
      map.set(p.compos_id, arr);
    }
    return [0, ...COMPOS.map(([id]) => id)]
      .map((composId) => ({ composId, photos: map.get(composId) ?? [] }))
      .filter((g) => g.photos.length > 0);
  }, [allPhotos]);
  // 재지정 대상으로 선택된 사진 - 선택된 상태에서 우측 탭을 클릭하면 그 구도로 재지정된다
  // (예전엔 카드마다 16개 항목 드롭다운으로 골랐는데, 클릭 한 번으로 바로 옮길 수 있게 바꿨다).
  const [reassignSourcePhotoId, setReassignSourcePhotoId] = useState<string | null>(null);

  // --- 크롭/회전: 같은 구도(compos_id)의 시작/중간/마지막 사진을 한 그룹으로 묶어 나란히 보여준다.
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
    // 파일 업로드 직후 1번 구도(가장 작은 compos_id)부터 바로 시작한다.
    // 아직 분류된 사진이 하나도 없어도 1번 탭이 기본 선택되어 있도록 한다.
    if (activeComposId === null) {
      setActiveComposId(composGroups[0]?.composId ?? COMPOS[0][0]);
    }
  }, [composGroups, activeComposId]);

  const activeGroup = composGroups.find((g) => g.composId === activeComposId) ?? null;

  // 같은 (구도, 세션타입) 자리에 사진이 2장 이상 배정된 경우(중복 업로드 등)를 걸러낸다.
  // 그대로 두면 "시작일" 카드가 여러 장 겹쳐 보이는 문제가 생긴다 - 대표 1장만 크롭 대상으로
  // 삼고, 나머지는 중복 경고로 보여준 뒤 갤러리에서 정리하도록 유도한다.
  const activeGroupBySessionType = useMemo(() => {
    if (!activeGroup) return [];
    const map = new Map<string, PhotoOut[]>();
    for (const p of activeGroup.photos) {
      const arr = map.get(p.session_type) ?? [];
      arr.push(p);
      map.set(p.session_type, arr);
    }
    return SESSION_TYPE_ORDER.filter((st) => map.has(st)).map((st) => ({
      sessionType: st as SessionType,
      photos: map.get(st)!,
    }));
  }, [activeGroup]);

  const primaryPhotos = useMemo(
    () => activeGroupBySessionType.filter((g) => g.photos.length === 1).map((g) => g.photos[0]),
    [activeGroupBySessionType],
  );

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

  function handleReassign(photoId: string, newComposId: number) {
    patchPhoto.mutate({ photoId, patch: { compos_id: newComposId } });
    if (newComposId > 0) setActiveComposId(newComposId); // 재지정한 구도로 바로 이동해 이어서 크롭
  }

  const reassignSourcePhoto = allPhotos.find((p) => p.photo_id === reassignSourcePhotoId) ?? null;

  function selectForReassign(photo: PhotoOut) {
    setReassignSourcePhotoId(photo.photo_id);
    if (photo.compos_id > 0) setActiveComposId(photo.compos_id);
  }

  // 재지정 대상이 선택된 상태면 탭 클릭이 "이동"이 아니라 "이 구도로 재지정"으로 동작한다.
  function handleTabClick(composId: number) {
    if (reassignSourcePhotoId) {
      handleReassign(reassignSourcePhotoId, composId);
      setReassignSourcePhotoId(null);
    } else {
      setActiveComposId(composId);
    }
  }

  // 다음 구도(1~16 순서) 탭으로 이동. 16번 다음은 그대로 머문다.
  function advanceToNextTab() {
    const ids = COMPOS.map(([id]) => id);
    const idx = ids.indexOf(activeComposId ?? -1);
    if (idx >= 0 && idx < ids.length - 1) {
      setActiveComposId(ids[idx + 1]);
    }
  }

  async function handleAddPhotos(st: SessionType, files: File[]): Promise<boolean> {
    setUploadingSlot(st);
    setAddPhotoError(null);
    try {
      // 새로 추가된 사진은 미분류 상태로 들어간다 - 왼쪽 목록에서 직접 구도를 지정해야 한다.
      await uploadPhotos.mutateAsync({ sessionType: st, sessionDate: addingDates[st], files });
      return true;
    } catch (e) {
      setAddPhotoError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
      return false;
    } finally {
      setUploadingSlot(null);
    }
  }

  function handleBoxChange(photoId: string, box: CropBox) {
    setEdits((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], cropBox: box } } : prev));
  }

  // 사용자가 실제로 드래그해서 크기를 바꿨을 때만 같은 구도의 다른 사진들에도 크기를 맞춘다
  // (위치는 각자 유지 - backend crop.py의 sync_size와 동일한 방식).
  function handleUserResize(photoId: string, box: CropBox) {
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of primaryPhotos) {
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
  if (allPhotos.length === 0) {
    return <p className="py-8 text-sm text-neutral-500">업로드된 사진이 없습니다. 이전 단계로 돌아가주세요.</p>;
  }

  const confirmedCount = classifiedPhotos.filter((p) => p.manually_confirmed).length;

  async function saveAll() {
    // 중복(같은 구도+세션타입에 2장 이상) 사진은 대상에서 제외 - 갤러리에서 먼저 정리해야 함
    for (const p of primaryPhotos) {
      const edit = edits[p.photo_id];
      if (!edit) continue;
      await patchPhoto.mutateAsync({
        photoId: p.photo_id,
        patch: { rotation_deg: edit.rotationDeg, crop_box: edit.cropBox, manually_confirmed: true },
      });
    }
    advanceToNextTab();
  }

  async function confirmAllAsIs() {
    for (const p of primaryPhotos) {
      await patchPhoto.mutateAsync({ photoId: p.photo_id, patch: { manually_confirmed: true } });
    }
    advanceToNextTab();
  }

  return (
    <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-start">
      {/* 좌측: 사진 목록 - 사진별 구도를 사람이 직접 지정 */}
      <aside className="flex w-full flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 lg:sticky lg:top-4 lg:w-60 lg:max-h-[calc(100vh-2rem)] lg:shrink-0 lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setGalleryOpen((v) => !v)}
            className="flex flex-1 items-center justify-between text-sm font-semibold text-neutral-700"
          >
            <span>사진 목록</span>
            <span className="text-xs font-normal text-neutral-400">{galleryOpen ? "접기 ▲" : "펼치기 ▼"}</span>
          </button>
        </div>
        <p className="-mt-2 text-xs text-neutral-400">사진을 클릭해 선택한 뒤, 우측 탭에서 구도를 선택하세요</p>

        {reassignSourcePhoto && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-brand-300 bg-brand-50 p-2 text-xs text-brand-800">
            <span>사진이 선택되었습니다. 우측 탭을 클릭해 구도를 지정하세요.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleReassign(reassignSourcePhoto.photo_id, 0);
                  setReassignSourcePhotoId(null);
                }}
                className="underline"
              >
                미분류로 이동
              </button>
              <button type="button" onClick={() => setReassignSourcePhotoId(null)} className="underline">
                선택 취소
              </button>
            </div>
          </div>
        )}

        {!addingPhotos && (
          <button
            type="button"
            onClick={() => setAddingPhotos(true)}
            className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            + 사진 추가 업로드
          </button>
        )}

        {galleryOpen && (
          <>
            {addingPhotos && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-600">사진 추가 업로드</p>
                  <button
                    type="button"
                    onClick={() => setAddingPhotos(false)}
                    className="text-xs text-neutral-400 hover:text-neutral-700"
                  >
                    취소
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {addSlots.map((st) => (
                    <UploadSlot
                      key={st}
                      sessionType={st}
                      existingCount={allPhotos.filter((p) => p.session_type === st).length}
                      date={addingDates[st]}
                      onDateChange={(v) => setAddingDates((d) => ({ ...d, [st]: v }))}
                      onFilesSelected={(files) => handleAddPhotos(st, files)}
                      uploading={uploadingSlot === st}
                    />
                  ))}
                </div>
                {addPhotoError && (
                  <p className="mt-2 text-xs text-red-600">{addPhotoError}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {galleryGroups.map(({ composId, photos }) => (
                <div key={composId}>
                  <h3 className="mb-1.5 text-xs font-semibold text-neutral-500">
                    {composId === 0 ? "미분류" : `${composId}. ${COMPOS.find(([id]) => id === composId)?.[1] ?? ""}`}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map((photo) => (
                      <PhotoThumbnail
                        key={photo.photo_id}
                        photo={photo}
                        selected={photo.photo_id === reassignSourcePhotoId}
                        onClick={() => selectForReassign(photo)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* 우측: 선택된 구도의 전-후 크롭/회전 (더 크게) */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">{confirmedCount} / {classifiedPhotos.length}장 확인 완료</p>
          <button type="button" onClick={toggleGuideOverlay} className="text-xs text-neutral-500 underline">
            가이드 오버레이 {guideOverlayVisible ? "숨기기" : "보이기"}
          </button>
        </div>

        <>
          {/* 항상 16개 구도 탭을 전부 보여준다 - 아직 사진이 없는 탭도 눌러서 미리 볼 수 있다 */}
          <div
            className={`flex flex-wrap gap-1.5 rounded-lg p-1.5 ${
              reassignSourcePhoto ? "bg-brand-50 ring-1 ring-brand-300" : ""
            }`}
          >
            {COMPOS.map(([composId, label]) => {
              const group = composGroups.find((g) => g.composId === composId);
              const hasPhotos = !!group;
              const allConfirmed = hasPhotos && group.photos.every((p) => p.manually_confirmed);
              return (
                <button
                  key={composId}
                  type="button"
                  onClick={() => handleTabClick(composId)}
                  className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                    composId === activeComposId
                      ? "border-brand-700 bg-brand-700 text-white"
                      : hasPhotos
                        ? "border-neutral-300 text-neutral-600"
                        : "border-dashed border-neutral-200 text-neutral-400"
                  }`}
                >
                  {composId}. {label} {allConfirmed && "✓"}
                </button>
              );
            })}
          </div>

          {!activeGroup && (
            <p className="py-8 text-sm text-neutral-500">
              이 구도엔 아직 지정된 사진이 없습니다. 왼쪽 사진 목록에서 사진을 이 구도로 지정해주세요.
            </p>
          )}

          {activeGroup && (
              <>
                <p className="text-xs text-neutral-400">
                  사진 중 하나의 크롭 크기를 바꾸면 같은 구도의 나머지 사진들도 같은 크기로 맞춰집니다 (위치는 각자
                  유지).
                </p>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {activeGroupBySessionType.map(({ sessionType, photos }) => {
                    if (photos.length > 1) {
                      // 같은 (구도, 세션타입) 자리에 사진이 여러 장 - 갤러리에서 정리하기 전엔 크롭 대상 아님
                      return (
                        <div
                          key={sessionType}
                          className="flex flex-col gap-2 rounded-xl border border-red-300 bg-red-50 p-3"
                        >
                          <h3 className="text-sm font-semibold text-red-700">
                            {SESSION_TYPE_LABEL[sessionType]} - 중복 {photos.length}장
                          </h3>
                          <p className="text-xs text-red-600">
                            이 자리에 사진이 여러 장 배정되어 있어 크롭할 수 없습니다. 왼쪽 사진 목록에서 하나만
                            남기고 나머지는 다른 구도(또는 미분류)로 옮겨주세요.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {photos.map((p) => (
                              <img
                                key={p.photo_id}
                                src={p.thumbnail_url}
                                alt=""
                                className="h-16 w-16 rounded border border-red-200 object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      );
                    }

                    const p = photos[0];
                    const edit = edits[p.photo_id];
                    if (!edit) return null;
                    const guideImg = getGuideImageUrl(p.compos_id, sideForSessionType(p.session_type));
                    return (
                      <div key={p.photo_id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {guideImg && (
                              <img
                                src={guideImg}
                                alt="예시 사진"
                                className="h-10 w-10 rounded border border-neutral-200 object-cover"
                              />
                            )}
                            <h3 className="text-sm font-semibold text-neutral-700">{SESSION_TYPE_LABEL[p.session_type]}</h3>
                          </div>
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
                    현재 크롭 그대로 확정
                  </button>
                  <button
                    type="button"
                    onClick={saveAll}
                    disabled={patchPhoto.isPending}
                    className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
                  >
                    {patchPhoto.isPending ? "저장 중..." : "이 구도 전체 저장"}
                  </button>
                </div>
              </>
            )}
        </>

        <button
          type="button"
          onClick={() => navigate(`/s/${sessionId}/match`)}
          className="self-end rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-800"
        >
          다음: 매칭 확인 →
        </button>
      </div>
    </div>
  );
}
