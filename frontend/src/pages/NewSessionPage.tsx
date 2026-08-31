import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { GroupedPhotoUploader, type UploadAssignment } from "../components/GroupedPhotoUploader";
import { useCreateSession } from "../hooks/useCreateSession";
import { useWizardStore } from "../store/wizardStore";
import type { Mode } from "../api/types";
import { getLastSessionId, setLastSessionId } from "../utils/sessionCache";

export function NewSessionPage() {
  const navigate = useNavigate();
  const { patientName, mode, setPatientName, setMode } = useWizardStore();
  const createSession = useCreateSession();
  const [creating, setCreating] = useState(false);
  const lastSessionId = getLastSessionId();

  async function handleUpload(assignment: UploadAssignment[]) {
    if (!patientName.trim()) {
      alert("환자명을 입력해주세요.");
      return;
    }
    if (assignment.length === 0) {
      alert("업로드할 그룹이 없습니다. 각 날짜 그룹에 슬롯을 지정해주세요.");
      return;
    }
    setCreating(true);
    try {
      const { session_id } = await createSession.mutateAsync({ patientName: patientName.trim(), mode });
      setLastSessionId(session_id);

      // session_store의 락 덕에 동시 요청도 안전하지만, 업로드 순서를 명확히 하려고 순차 처리한다.
      for (const a of assignment) {
        await api.uploadPhotos(session_id, a.sessionType, a.date, a.files);
      }

      navigate(`/s/${session_id}/upload`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Vita Compare</h1>
      <p className="mb-6 text-sm text-neutral-500">환자 정보를 입력하고 촬영 사진을 업로드하세요.</p>

      {lastSessionId && (
        <button
          type="button"
          onClick={() => navigate(`/s/${lastSessionId}/upload`)}
          className="mb-6 w-full rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-left text-sm text-neutral-600 hover:bg-neutral-50"
        >
          이전 작업 이어하기 →
        </button>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">환자명</span>
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
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
                onClick={() => setMode(m)}
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
        </div>
      </div>

      <GroupedPhotoUploader mode={mode} uploading={creating} onConfirm={handleUpload} />
    </div>
  );
}
