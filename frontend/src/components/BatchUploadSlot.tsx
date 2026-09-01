import { useRef } from "react";

interface BatchUploadSlotProps {
  onFilesSelected: (files: File[]) => Promise<boolean> | void;
  uploading?: boolean;
}

// 결과는 이 컴포넌트가 아니라 아래 시작일/중간일/종료일 섹션(UploadSlot)에 촬영일 기준으로
// 나뉘어 바로 나타난다 - 여기는 "한꺼번에 선택"하는 입력 UI만 담당한다.
export function BatchUploadSlot({ onFilesSelected, uploading }: BatchUploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800">전/후 사진 한 번에 업로드</h3>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        시작일/종료일(장기 모드는 중간일 포함) 사진을 한꺼번에 선택하면 촬영일 기준으로 자동
        구분되어 아래 섹션에 나뉘어 들어갑니다.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) await onFilesSelected(files);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl bg-brand-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-800 disabled:opacity-50"
      >
        {uploading ? "업로드 중..." : "사진 한꺼번에 선택"}
      </button>
    </div>
  );
}
