import type { BodyCompRowIn, Mode } from "../api/types";
import { formatChange } from "../utils/bodyCompPreview";

interface BodyCompFormProps {
  mode: Mode;
  rows: BodyCompRowIn[];
  onRowsChange: (rows: BodyCompRowIn[]) => void;
}

function updateRow(rows: BodyCompRowIn[], idx: number, patch: Partial<BodyCompRowIn>): BodyCompRowIn[] {
  return rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
}

export function BodyCompForm({ mode, rows, onRowsChange }: BodyCompFormProps) {
  const showMid = mode === "long";

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-sky-50 text-neutral-600">
            <th className="px-3 py-2 text-left font-medium">항목</th>
            <th className="px-3 py-2 text-left font-medium">시작</th>
            {showMid && <th className="px-3 py-2 text-left font-medium">중간</th>}
            <th className="px-3 py-2 text-left font-medium">마지막</th>
            <th className="px-3 py-2 text-left font-medium">변화량 (미리보기)</th>
            <th className="px-3 py-2 text-left font-medium" style={{ background: "#f7ddec" }}>
              목표치(적정치)
            </th>
            <th className="px-3 py-2 text-center font-medium">강조</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-neutral-100 last:border-0">
              <td className="px-2 py-1.5">
                <input
                  className="w-32 rounded border border-neutral-200 px-2 py-1"
                  value={row.label}
                  onChange={(e) => onRowsChange(updateRow(rows, idx, { label: e.target.value }))}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  className="w-24 rounded border border-neutral-200 px-2 py-1"
                  value={row.start}
                  onChange={(e) => onRowsChange(updateRow(rows, idx, { start: e.target.value }))}
                />
              </td>
              {showMid && (
                <td className="px-2 py-1.5">
                  <input
                    className="w-24 rounded border border-neutral-200 px-2 py-1"
                    value={row.mid ?? ""}
                    onChange={(e) => onRowsChange(updateRow(rows, idx, { mid: e.target.value }))}
                  />
                </td>
              )}
              <td className="px-2 py-1.5">
                <input
                  className="w-24 rounded border border-neutral-200 px-2 py-1"
                  value={row.end}
                  onChange={(e) => onRowsChange(updateRow(rows, idx, { end: e.target.value }))}
                />
              </td>
              <td className="px-3 py-1.5 font-semibold text-neutral-700 tabular-nums">
                {formatChange(row.start, row.end)}
              </td>
              <td className="px-2 py-1.5" style={{ background: "#fbeef5" }}>
                <input
                  className="w-24 rounded border border-neutral-200 bg-white px-2 py-1"
                  value={row.target}
                  onChange={(e) => onRowsChange(updateRow(rows, idx, { target: e.target.value }))}
                />
              </td>
              <td className="px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={row.highlight}
                  onChange={(e) => onRowsChange(updateRow(rows, idx, { highlight: e.target.checked }))}
                />
              </td>
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onRowsChange(rows.filter((_, i) => i !== idx))}
                  className="text-xs text-neutral-400 hover:text-red-600"
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3">
        <button
          type="button"
          onClick={() =>
            onRowsChange([
              ...rows,
              { label: "", start: "", mid: showMid ? "" : null, end: "", target: "", highlight: false },
            ])
          }
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          + 항목 추가
        </button>
      </div>
    </div>
  );
}
