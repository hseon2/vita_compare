import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BodyCompForm } from "../components/BodyCompForm";
import { SESSION_TYPE_LABEL } from "../config/sessionTypes";
import { useBodyComp, useSaveBodyComp } from "../hooks/useBodyComp";
import { usePhotos } from "../hooks/usePhotos";
import { deriveModeFromPhotos, getSetPairing } from "../utils/derive";
import type { BodyCompRowIn, PhotoOut } from "../api/types";

export function MatchConfirmPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const photosQuery = usePhotos(sessionId);
  const bodyCompQuery = useBodyComp(sessionId);
  const saveBodyComp = useSaveBodyComp(sessionId!);

  const [rows, setRows] = useState<BodyCompRowIn[] | null>(null);
  useEffect(() => {
    if (bodyCompQuery.data && rows === null) setRows(bodyCompQuery.data.rows);
  }, [bodyCompQuery.data, rows]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleRowsChange(next: BodyCompRowIn[]) {
    setRows(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // 스텝 인디케이터로 다른 화면으로 바로 이동해도 데이터가 유실되지 않도록 디바운스 자동저장
    saveTimer.current = setTimeout(() => saveBodyComp.mutate(next), 600);
  }

  if (!photosQuery.data || !rows) {
    return <p className="py-8 text-sm text-neutral-400">불러오는 중...</p>;
  }

  const mode = deriveModeFromPhotos(photosQuery.data);
  const pairing = getSetPairing(mode);

  const byComposAndType = new Map<string, PhotoOut>();
  for (const p of photosQuery.data.photos) {
    if (p.compos_id > 0) byComposAndType.set(`${p.compos_id}:${p.session_type}`, p);
  }

  const composIds = Array.from(
    new Set(photosQuery.data.photos.filter((p) => p.compos_id > 0).map((p) => p.compos_id)),
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-8 py-4">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-neutral-700">전-후 매칭 확인</h2>
        {pairing.map(([beforeType, afterType]) => (
          <div key={`${beforeType}-${afterType}`} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-neutral-500">
              {SESSION_TYPE_LABEL[beforeType]} → {SESSION_TYPE_LABEL[afterType]}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {composIds.map((cid) => {
                const before = byComposAndType.get(`${cid}:${beforeType}`);
                const after = byComposAndType.get(`${cid}:${afterType}`);
                if (!before && !after) return null;
                const label = before?.compos_label ?? after?.compos_label ?? "";
                return (
                  <div key={cid} className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-medium text-neutral-600">
                      {cid}. {label}
                    </p>
                    {before && after ? (
                      <div className="flex gap-2">
                        <img
                          src={before.thumbnail_url}
                          alt={`${label} 전`}
                          className="aspect-[3/4] w-1/2 rounded object-cover"
                        />
                        <img
                          src={after.thumbnail_url}
                          alt={`${label} 후`}
                          className="aspect-[3/4] w-1/2 rounded object-cover"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-red-500">이 구도는 PPT에 포함되지 않습니다 (한쪽 세션에만 존재)</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">체성분 검사 변화</h2>
        <BodyCompForm mode={mode} rows={rows} onRowsChange={handleRowsChange} />
      </section>

      <button
        type="button"
        onClick={() => navigate(`/s/${sessionId}/generate`)}
        className="self-end rounded-xl bg-brand-700 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-brand-800"
      >
        다음: 생성 →
      </button>
    </div>
  );
}
