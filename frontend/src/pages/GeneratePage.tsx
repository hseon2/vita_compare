import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useGenerateStatus, useStartGenerate } from "../hooks/useGenerate";
import { clearLastSessionId } from "../utils/sessionCache";

export function GeneratePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const statusQuery = useGenerateStatus(sessionId);
  const startGenerate = useStartGenerate(sessionId!);
  const [startError, setStartError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function handleStart() {
    setStartError(null);
    try {
      await startGenerate.mutateAsync();
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : "생성 요청에 실패했습니다.");
    }
  }

  // 매칭 확인 화면에서 "다음: 생성 →"을 누르면 이 화면으로 넘어오자마자 바로 생성이 시작된다 -
  // 사람이 다시 "PPT 생성" 버튼을 누를 필요가 없다. 이미 생성이 시작됐거나(running/done) 실패한
  // 적이 있으면(error, "다시 시도" 버튼으로 수동 재시도) 자동으로 다시 트리거하지 않는다.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (statusQuery.data && statusQuery.data.state === "idle") {
      autoStartedRef.current = true;
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQuery.data]);

  function handleDownloadClick() {
    // 다운로드는 <a href> 네이티브 이동으로 처리한다 (백엔드가 스트리밍 후 세션을 서버에서 삭제함)
    clearLastSessionId(sessionId);
    setDownloaded(true);
  }

  const status = statusQuery.data;

  if (downloaded) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-900">다운로드가 시작되었습니다</p>
        <p className="text-sm text-neutral-500">다운로드 후에는 이 세션을 재사용할 수 없습니다.</p>
        <a href="/" className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-800">
          새 작업 시작
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-16">
      {(!status || status.state === "idle") && (
        <p className="text-sm text-neutral-500">PPT 생성을 준비하고 있습니다...</p>
      )}

      {startError && <p className="text-sm text-red-600">{startError}</p>}

      {status?.state === "running" && (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full bg-brand-700 transition-all"
              style={{ width: `${Math.round(status.progress * 100)}%` }}
            />
          </div>
          <p className="text-center text-sm text-neutral-500">
            {status.message} ({Math.round(status.progress * 100)}%)
          </p>
        </div>
      )}

      {status?.state === "done" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-neutral-600">생성 완료: {status.result_path}</p>
          <a
            href={api.downloadUrl(sessionId!)}
            onClick={handleDownloadClick}
            className="rounded-xl bg-brand-700 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-800"
          >
            PPT 다운로드
          </a>
        </div>
      )}

      {status?.state === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-red-600">생성 중 오류가 발생했습니다: {status.message}</p>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700"
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
