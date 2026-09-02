import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { BatchUploadSlot } from "../components/BatchUploadSlot";
import { ImageLightbox } from "../components/ImageLightbox";
import { UploadSlot } from "../components/UploadSlot";
import { useDeletePhoto } from "../hooks/useDeletePhoto";
import { usePatchPhoto } from "../hooks/usePatchPhoto";
import { photosQueryKey, usePhotos } from "../hooks/usePhotos";
import { sessionMetaQueryKey, useSessionMeta, useUpdateSessionMeta } from "../hooks/useSessionMeta";
import { useWizardStore } from "../store/wizardStore";
import { groupFilesByDate } from "../utils/dateGrouping";
import { clearLastSessionId, getLastSessionId, setLastSessionId } from "../utils/sessionCache";
import type { Mode, PhotoOut, SessionType } from "../api/types";

const TODAY = new Date().toISOString().slice(0, 10);
const PLACEHOLDER_NAME_RE = /^이름없음-[a-z0-9]{4}$/;

function randomPlaceholderName(): string {
  return `이름없음-${Math.random().toString(36).slice(2, 6)}`;
}

// "/" (세션 생성 전)과 "/s/:sessionId/upload" (세션 생성 후, 추가 업로드) 둘 다 이 화면
// 하나로 처리한다 - 예전엔 화면이 둘로 나뉘어 있었지만 기능이 사실상 같아서 통합했다.
export function UploadPage() {
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const draft = useWizardStore();

  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const sessionId = routeSessionId ?? localSessionId ?? undefined;
  const lastSessionId = !sessionId ? getLastSessionId() : null;

  const photosQuery = usePhotos(sessionId);
  const metaQuery = useSessionMeta(sessionId);
  const updateMeta = useUpdateSessionMeta(sessionId ?? "");
  const patchPhoto = usePatchPhoto(sessionId ?? "");
  const deletePhoto = useDeletePhoto(sessionId ?? "");

  const [dates, setDates] = useState<Record<SessionType, string>>({ start: TODAY, mid: TODAY, end: TODAY });
  const [uploadingSlot, setUploadingSlot] = useState<SessionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoOut | null>(null);
  // 체크하면 시작/중간/종료 사진을 따로따로가 아니라 한꺼번에 선택하고, 촬영일(파일 날짜) 기준으로
  // 자동 구분해서 업로드한다. 정확한 분류가 아니므로 어긋나면 아래 섹션에서 드래그로 옮길 수 있다.
  const [batchMode, setBatchMode] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);

  const mode: Mode = sessionId ? (metaQuery.data?.mode ?? "standard") : draft.mode;
  const slots: SessionType[] = mode === "long" ? ["start", "mid", "end"] : ["start", "end"];

  // 환자명: 세션이 있으면 서버값 기준(디바운스 저장), 없으면 로컬 초안(Zustand)에 바로 반영
  const [nameDraft, setNameDraft] = useState("");
  const nameInitialized = useRef(false);
  useEffect(() => {
    if (sessionId && metaQuery.data && !nameInitialized.current) {
      setNameDraft(metaQuery.data.patient_name);
      nameInitialized.current = true;
    }
  }, [sessionId, metaQuery.data]);
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleNameChange(v: string) {
    if (!sessionId) {
      draft.setPatientName(v);
      return;
    }
    setNameDraft(v);
    if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => {
      if (v.trim()) updateMeta.mutate({ patient_name: v.trim() });
    }, 600);
  }
  const patientName = sessionId ? nameDraft : draft.patientName;

  const photosByType = useMemo(() => {
    const map: Record<SessionType, PhotoOut[]> = { start: [], mid: [], end: [] };
    for (const p of photosQuery.data?.photos ?? []) map[p.session_type].push(p);
    return map;
  }, [photosQuery.data]);

  async function handleFiles(st: SessionType, files: File[]): Promise<boolean> {
    setUploadingSlot(st);
    setError(null);
    try {
      let sid = sessionId;
      if (!sid) {
        // 환자명을 나중에 입력해도 되므로, 비어있으면 임시 이름으로 세션만 먼저 만든다.
        const res = await api.createSession(draft.patientName.trim() || randomPlaceholderName(), draft.mode);
        sid = res.session_id;
      }
      await api.uploadPhotos(sid, st, dates[st], files);
      queryClient.invalidateQueries({ queryKey: photosQueryKey(sid) });
      queryClient.invalidateQueries({ queryKey: sessionMetaQueryKey(sid) });
      // 업로드가 완전히 끝난 뒤에만 이동한다 - navigate가 먼저 일어나면 화면이 새로 마운트되며
      // 아직 반영 안 된 이전 상태로 사진 목록을 한 번 잘못 불러오는 경합이 생겼었다.
      if (!sessionId) {
        setLocalSessionId(sid);
        setLastSessionId(sid);
        navigate(`/s/${sid}/upload`, { replace: true });
      }
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "업로드에 실패했습니다.");
      return false;
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleBatchFiles(files: File[]): Promise<boolean> {
    setBatchUploading(true);
    setError(null);
    try {
      let sid = sessionId;
      if (!sid) {
        const res = await api.createSession(draft.patientName.trim() || randomPlaceholderName(), draft.mode);
        sid = res.session_id;
      }
      const groups = groupFilesByDate(files, slots);
      for (const st of slots) {
        const group = groups[st];
        if (group && group.files.length > 0) {
          await api.uploadPhotos(sid, st, group.date, group.files);
        }
      }
      queryClient.invalidateQueries({ queryKey: photosQueryKey(sid) });
      queryClient.invalidateQueries({ queryKey: sessionMetaQueryKey(sid) });
      if (!sessionId) {
        setLocalSessionId(sid);
        setLastSessionId(sid);
        navigate(`/s/${sid}/upload`, { replace: true });
      }
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "업로드에 실패했습니다.");
      return false;
    } finally {
      setBatchUploading(false);
    }
  }

  function handleDeletePhoto(photoId: string) {
    if (!window.confirm("이 사진을 삭제할까요?")) return;
    deletePhoto.mutate(photoId);
  }

  function handleMovePhoto(photoId: string, targetSessionType: SessionType) {
    const photo = photosQuery.data?.photos.find((p) => p.photo_id === photoId);
    if (!photo || photo.session_type === targetSessionType) return;
    patchPhoto.mutate({ photoId, patch: { session_type: targetSessionType } });
  }

  // 입력한 환자명/모드/업로드 진행 상태를 전부 지우고 새 세션을 시작할 수 있게 한다.
  // 서버의 이전 세션 자체를 삭제하지는 않는다(삭제 API가 없음) - 그냥 참조를 놓고 새로 시작.
  function handleReset() {
    if (!window.confirm("입력한 내용을 초기화하고 새로 시작할까요?")) return;
    draft.resetDraft();
    setLocalSessionId(null);
    setNameDraft("");
    nameInitialized.current = false;
    setDates({ start: TODAY, mid: TODAY, end: TODAY });
    setError(null);
    clearLastSessionId();
    if (routeSessionId) navigate("/", { replace: true });
  }

  function handleModeChange(m: Mode) {
    if (m === mode) return;
    if (!sessionId) draft.setMode(m);
    else updateMeta.mutate({ mode: m });
  }

  function goNext() {
    if (!sessionId || !photosQuery.data?.photos.length) return;
    const trimmed = patientName.trim();
    if (!trimmed || PLACEHOLDER_NAME_RE.test(trimmed)) {
      setError("환자명을 입력해주세요.");
      return;
    }
    navigate(`/s/${sessionId}/options`);
  }

  // "/"과 "/s/:id/upload"는 이제 WizardLayout이 헤더+스텝 인디케이터를 항상 동일하게
  // 감싸주므로, 이 컴포넌트 자체는 다른 위저드 화면들과 같은 폭(WizardLayout의 max-w-5xl)
  // 안에서 렌더된다. 다만 이 화면은 사진 그리드가 아니라 순차적인 입력 폼이라, 내용은 더
  // 좁게(max-w-xl) 잡는다 - mx-auto로 가운데 정렬하면 위 로고/스텝 인디케이터(왼쪽 정렬)와
  // 시작 위치가 어긋나 보이므로, 로고와 같은 왼쪽 기준선에 맞춘다.
  return (
    <div className="flex w-full max-w-xl flex-col gap-6 py-6">
      <div className="relative flex flex-col gap-3 overflow-hidden">
        {/* 헤더 뒤 은은한 보라 글로우 - 장식 목적, 클릭 영역과 겹치지 않게 pointer-events-none.
            overflow-hidden으로 감싸서 좁은 화면에서 가로 스크롤이 생기지 않게 한다. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 -left-6 h-36 w-36 rounded-full bg-brand-200/40 blur-3xl"
        />
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            thebeautycl
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="shrink-0 rounded-xl border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700"
          >
            초기화
          </button>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">환자 정보를 입력하세요</h1>
          <p className="mt-1 text-sm text-neutral-500">촬영 사진을 업로드하면 다음 단계에서 AI가 구도를 자동으로 분류해요.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {lastSessionId && (
        <button
          type="button"
          onClick={() => navigate(`/s/${lastSessionId}/upload`)}
          className="flex w-full items-center justify-between rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-left text-sm font-medium text-brand-800 transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          이전 작업 이어하기
          <span aria-hidden>→</span>
        </button>
      )}

      <div className="flex flex-col gap-5 rounded-3xl border border-neutral-100 bg-white p-6 shadow-[0_2px_8px_-2px_rgba(16,24,40,0.08),0_4px_24px_-4px_rgba(16,24,40,0.06)]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-neutral-800">환자명</span>
          <input
            className="rounded-xl border border-neutral-200 px-3.5 py-2.5 text-lg font-semibold text-neutral-900 outline-none transition-shadow focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            value={patientName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="예: 홍길동"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-neutral-800">기간 모드</span>
          <div className="flex gap-2 rounded-xl bg-neutral-50 p-1">
            {(["standard", "long"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-brand-700 text-white shadow-sm"
                    : "text-neutral-600 hover:bg-white hover:text-neutral-800"
                }`}
              >
                {m === "standard" ? "표준 (시작일/종료일)" : "장기 (시작일/중간일/종료일)"}
              </button>
            ))}
          </div>
          {mode === "standard" && photosByType.mid.length > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              중간일 사진이 {photosByType.mid.length}장 있습니다. 위에서 "장기"로 바꾸면 중간일 슬롯이 표시됩니다.
            </p>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={batchMode}
          onChange={(e) => setBatchMode(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 accent-brand-600"
        />
        전/후 사진 한 번에 업로드 (촬영일로 자동 구분)
      </label>

      {batchMode && <BatchUploadSlot onFilesSelected={handleBatchFiles} uploading={batchUploading} />}

      {/* 한 번에 업로드 모드에서는 실제로 사진이 들어오기 전까지 빈 시작일/종료일 섹션을
          미리 보여줄 필요가 없다 - 업로드가 끝나 촬영일로 구분된 뒤에야 나타난다. */}
      {(!batchMode || (photosQuery.data?.photos.length ?? 0) > 0) && (
      <div className="flex flex-col gap-3">
        {slots.map((st) => (
          <UploadSlot
            key={st}
            sessionType={st}
            photos={photosByType[st]}
            date={dates[st]}
            onDateChange={(v) => setDates((d) => ({ ...d, [st]: v }))}
            onFilesSelected={(files) => handleFiles(st, files)}
            uploading={uploadingSlot === st}
            onDeletePhoto={handleDeletePhoto}
            onOpenLightbox={setLightboxPhoto}
            onMovePhoto={handleMovePhoto}
          />
        ))}
      </div>
      )}

      <button
        type="button"
        disabled={!sessionId || !photosQuery.data?.photos.length}
        onClick={goNext}
        className="mt-2 self-end rounded-xl bg-brand-700 px-5 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-brand-800 hover:shadow-md disabled:opacity-50 disabled:shadow-none"
      >
        다음: 옵션 선택 →
      </button>

      {lightboxPhoto && (
        <ImageLightbox
          imageUrl={lightboxPhoto.thumbnail_url}
          fileName={lightboxPhoto.original_filename}
          onClose={() => setLightboxPhoto(null)}
        />
      )}
    </div>
  );
}
