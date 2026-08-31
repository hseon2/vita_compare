interface ConfidenceBadgeProps {
  confidence: number;
  lowConfidence: boolean;
  poseError: boolean;
  manuallyConfirmed: boolean;
}

export function ConfidenceBadge({
  confidence,
  lowConfidence,
  poseError,
  manuallyConfirmed,
}: ConfidenceBadgeProps) {
  if (poseError) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        포즈 미검출
      </span>
    );
  }
  if (manuallyConfirmed) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        확인됨
      </span>
    );
  }
  if (lowConfidence) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        확인 필요 ({Math.round(confidence * 100)}%)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {Math.round(confidence * 100)}%
    </span>
  );
}
