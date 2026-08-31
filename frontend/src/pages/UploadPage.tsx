import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { BatchUploadSlot } from "../components/BatchUploadSlot";
import { UploadSlot } from "../components/UploadSlot";
import { photosQueryKey, usePhotos } from "../hooks/usePhotos";
import { sessionMetaQueryKey, useSessionMeta, useUpdateSessionMeta } from "../hooks/useSessionMeta";
import { useWizardStore } from "../store/wizardStore";
import { groupFilesByDate } from "../utils/dateGrouping";
import { clearLastSessionId, getLastSessionId, setLastSessionId } from "../utils/sessionCache";
import type { Mode, SessionType } from "../api/types";

const TODAY = new Date().toISOString().slice(0, 10);

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

  const [dates, setDates] = useState<Record<SessionType, string>>({ start: TODAY, mid: TODAY, end: TODAY });
  const [uploadingSlot, setUploadingSlot] = useState<SessionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 체크하면 시작/중간/종료 사진을 따로따로가 아니라 한꺼번에 선택하고, 촬영일(파일 날짜) 기준으로
  // 자동 구분해서 업로드한다. 정확한 분류가 아니므로 어긋나면 이후 화면에서 다시 확인해야 한다.
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

  const countsByType = useMemo(() => {
    const counts: Record<SessionType, number> = { start: 0, mid: 0, end: 0 };
    for (const p of photosQuery.data?.photos ?? []) counts[p.session_type]++;
    return counts;
  }, [photosQuery.data]);

  async function handleFiles(st: SessionType, files: File[]): Promise<boolean> {
    setUploadingSlot(st);
    setError(null);
    try {
      let sid = sessionId;
      if (!sid) {
        const name = draft.patientName.trim();
        if (!name) throw new Error("환자명을 입력해주세요.");
        const res = await api.createSession(name, draft.mode);
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
        const name = draft.patientName.trim();
        if (!name) throw new Error("환자명을 입력해주세요.");
        const res = await api.createSession(name, draft.mode);
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
    navigate(`/s/${sessionId}/crop`);
  }

  // "/"과 "/s/:id/upload"는 이제 WizardLayout이 헤더+스텝 인디케이터를 항상 동일하게
  // 감싸주므로, 이 컴포넌트 자체는 폭 제한이나 제목을 따로 두지 않고 다른 위저드 화면들과
  // 완전히 같은 모양으로 렌더한다.
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">환자 정보를 입력하고 촬영 사진을 업로드하세요.</p>
        <button
          type="button"
          onClick={handleReset}
          className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
        >
          초기화
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {lastSessionId && (
        <button
          type="button"
          onClick={() => navigate(`/s/${lastSessionId}/upload`)}
          className="w-full rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-left text-sm text-neutral-600 hover:bg-neutral-50"
        >
          이전 작업 이어하기 →
        </button>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">환자명</span>
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-lg font-semibold"
            value={patientName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="예: 홍길동"
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">기간 모드</span>
          <div className="flex gap-2">
            {(["standard", "long"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === m
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-neutral-300 text-neutral-600"
                }`}
              >
                {m === "standard" ? "표준 (시작일/종료일)" : "장기 (시작일/중간일/종료일)"}
              </button>
            ))}
          </div>
          {mode === "standard" && countsByType.mid > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              중간일 사진이 {countsByType.mid}장 있습니다. 위에서 "장기"로 바꾸면 중간일 슬롯이 표시됩니다.
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

      {batchMode ? (
        <BatchUploadSlot
          existingCount={slots.reduce((sum, st) => sum + countsByType[st], 0)}
          onFilesSelected={handleBatchFiles}
          uploading={batchUploading}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {slots.map((st) => (
            <UploadSlot
              key={st}
              sessionType={st}
              existingCount={countsByType[st]}
              date={dates[st]}
              onDateChange={(v) => setDates((d) => ({ ...d, [st]: v }))}
              onFilesSelected={(files) => handleFiles(st, files)}
              uploading={uploadingSlot === st}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={!sessionId || !photosQuery.data?.photos.length}
        onClick={goNext}
        className="mt-2 self-end rounded-lg bg-brand-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
      >
        다음: 분류/크롭 →
      </button>
    </div>
  );
}
