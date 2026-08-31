import { useId, useState } from "react";
import type { Mode, SessionType } from "../api/types";
import { defaultSlotForGroup, groupFilesByDate, type DateGroup, type SlotChoice } from "../utils/dateGrouping";

const SLOT_LABEL: Record<SessionType, string> = { start: "시작", mid: "중간", end: "마지막" };

export interface UploadAssignment {
  sessionType: SessionType;
  date: string;
  files: File[];
}

interface GroupedPhotoUploaderProps {
  mode: Mode;
  uploading?: boolean;
  onConfirm: (assignment: UploadAssignment[]) => void | Promise<void>;
}

export function GroupedPhotoUploader({ mode, uploading, onConfirm }: GroupedPhotoUploaderProps) {
  const inputId = useId();
  const [groups, setGroups] = useState<DateGroup[] | null>(null);
  const [choices, setChoices] = useState<SlotChoice[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const slotOptions: SlotChoice[] =
    mode === "long" ? ["start", "mid", "end", "unassigned"] : ["start", "end", "unassigned"];

  async function handleFiles(files: File[]) {
    setAnalyzing(true);
    try {
      const grouped = await groupFilesByDate(files);
      setGroups(grouped);
      setChoices(grouped.map((_, i) => defaultSlotForGroup(i, grouped.length, mode)));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirm() {
    if (!groups) return;
    const assignment: UploadAssignment[] = groups
      .map((g, i) => ({ sessionType: choices[i], date: g.date, files: g.files }))
      .filter((a): a is UploadAssignment => a.sessionType !== "unassigned");
    await onConfirm(assignment);
    setGroups(null);
  }

  if (!groups) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center">
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) handleFiles(files);
            e.target.value = "";
          }}
        />
        <p className="mb-3 text-sm text-neutral-500">
          시작·{mode === "long" ? "중간·" : ""}마지막 사진을 한 번에 선택하세요.
          <br />
          촬영일(EXIF, 없으면 파일 날짜) 기준으로 자동 구분됩니다.
        </p>
        <label
          htmlFor={inputId}
          className="inline-block cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          {analyzing ? "분석 중..." : "전체 사진 선택"}
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-600">
        촬영일 기준으로 <strong>{groups.length}개</strong> 그룹으로 자동 분류했습니다. 잘못 배정된 그룹은 아래에서
        직접 바꿔주세요.
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((g, i) => (
          <div
            key={g.date}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-neutral-800">{g.date}</p>
              <p className="text-xs text-neutral-500">{g.files.length}장</p>
            </div>
            <select
              value={choices[i]}
              onChange={(e) =>
                setChoices((c) => c.map((v, idx) => (idx === i ? (e.target.value as SlotChoice) : v)))
              }
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {slotOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "unassigned" ? "포함 안 함" : SLOT_LABEL[opt]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setGroups(null)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          다시 선택
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={handleConfirm}
          className="flex-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "이대로 업로드"}
        </button>
      </div>
    </div>
  );
}
