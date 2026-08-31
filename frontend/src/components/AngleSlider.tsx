interface AngleSliderProps {
  value: number;
  aiValue: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}

const MIN = -15;
const MAX = 15;
const STEP = 0.1;

export function AngleSlider({ value, aiValue, onChange, onCommit }: AngleSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-neutral-700">수평 보정 각도</span>
        <span className="tabular-nums text-neutral-500">{value.toFixed(1)}°</span>
      </div>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-neutral-900"
      />
      <button
        type="button"
        onClick={() => {
          onChange(aiValue);
          onCommit(aiValue);
        }}
        className="self-start text-xs text-neutral-500 underline hover:text-neutral-800"
      >
        AI 값({aiValue.toFixed(1)}°)으로 초기화
      </button>
    </div>
  );
}
