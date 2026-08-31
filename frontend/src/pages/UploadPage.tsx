import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GroupedPhotoUploader, type UploadAssignment } from "../components/GroupedPhotoUploader";
import { useClassifySession } from "../hooks/useClassifySession";
import { usePhotos } from "../hooks/usePhotos";
import { useSessionMeta, useUpdateSessionMeta } from "../hooks/useSessionMeta";
import { useUploadPhotos } from "../hooks/useUploadPhotos";
import type { Mode, SessionType } from "../api/types";

const SESSION_TYPE_LABEL: Record<SessionType, string> = { start: "시작", mid: "중간", end: "마지막" };

export function UploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const metaQuery = useSessionMeta(sessionId);
  const updateMeta = useUpdateSessionMeta(sessionId!);
  const uploadPhotos = useUploadPhotos(sessionId!);
  const classifySession = useClassifySession(sessionId!);
  const [uploading, setUploading] = useState(false);
  const [confirmReclassify, setConfirmReclassify] = useState(false);

  const mode: Mode = metaQuery.data?.mode ?? "standard";

  // 환자명은 입력할 때마다 저장하지 않고, 타이핑이 멈춘 뒤 디바운스로 저장한다
  const [nameDraft, setNameDraft] = useState("");
  const nameInitialized = useRef(false);
  useEffect(() => {
    if (metaQuery.data && !nameInitialized.current) {
      setNameDraft(metaQuery.data.patient_name);
      nameInitialized.current = true;
    }
  }, [metaQuery.data]);
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleNameChange(v: string) {
    setNameDraft(v);
    if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => {
      if (v.trim()) updateMeta.mutate({ patient_name: v.trim() });
    }, 600);
  }

  const countsByType = useMemo(() => {
    const counts: Record<SessionType, number> = { start: 0, mid: 0, end: 0 };
    for (const p of photosQuery.data?.photos ?? []) counts[p.session_type]++;
    return counts;
  }, [photosQuery.data]);

  const hasClassified = (photosQuery.data?.photos ?? []).some((p) => p.compos_id > 0);
  const hasUnclassified = (photosQuery.data?.photos ?? []).some((p) => p.compos_id === 0 && !p.pose_error);

  async function handleUpload(assignment: UploadAssignment[]) {
    setUploading(true);
    try {
      for (const a of assignment) {
        await uploadPhotos.mutateAsync({ sessionType: a.sessionType, sessionDate: a.date, files: a.files });
      }
    } finally {
      setUploading(false);
    }
  }

  async function goNext() {
    if (!(photosQuery.data?.photos.length)) return;
    if (hasClassified && hasUnclassified) {
      setConfirmReclassify(true);
      return;
    }
    if (!hasClassified) {
      await classifySession.mutateAsync();
    }
    navigate(`/s/${sessionId}/classify`);
  }

  async function reclassifyAndGo() {
    setConfirmReclassify(false);
    await classifySession.mutateAsync();
    navigate(`/s/${sessionId}/classify`);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">환자명</span>
          <input
            className="rounded border border-neutral-300 px-3 py-2 text-lg font-semibold"
            value={nameDraft}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">기간 모드</span>
          <div className="flex gap-2">
            {(["standard", "long"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => m !== mode && updateMeta.mutate({ mode: m })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  mode === m
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-600"
                }`}
              >
                {m === "standard" ? "표준 (시작/마지막)" : "장기 (시작/중간/마지막)"}
              </button>
            ))}
          </div>
          {mode === "standard" && countsByType.mid > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              중간 촬영 사진이 {countsByType.mid}장 있습니다. 위에서 "장기"로 바꾸면 중간 슬롯이 표시됩니다.
            </p>
          )}
        </div>

        <p className="text-xs text-neutral-400">
          {(["start", "mid", "end"] as SessionType[])
            .filter((st) => mode === "long" || st !== "mid")
            .map((st) => `${SESSION_TYPE_LABEL[st]} ${countsByType[st]}장`)
            .join(" / ")}
        </p>
      </div>

      <GroupedPhotoUploader mode={mode} uploading={uploading} onConfirm={handleUpload} />

      {confirmReclassify && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-3">
            이미 수동으로 확인한 사진이 있는데 새 사진이 추가되었습니다. 재분류를 실행하면 기존 수동
            수정 내역이 초기화됩니다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reclassifyAndGo}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white"
            >
              재분류 실행
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmReclassify(false);
                navigate(`/s/${sessionId}/classify`);
              }}
              className="rounded-lg border border-amber-400 px-3 py-1.5 font-medium text-amber-800"
            >
              건너뛰기 (새 사진은 수동으로 지정)
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={classifySession.isPending || !photosQuery.data?.photos.length}
        onClick={goNext}
        className="mt-2 self-end rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {classifySession.isPending ? "분류 중..." : "다음: 분류 확인 →"}
      </button>
    </div>
  );
}
