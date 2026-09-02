interface ConfidenceBadgeProps {
  confidence: number;
  lowConfidence: boolean;
  poseError: boolean;
  manuallyConfirmed: boolean;
}

function Badge({ dotColor, bg, text, children }: { dotColor: string; bg: string; text: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-medium whitespace-nowrap ${bg} ${text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {children}
    </span>
  );
}

export function ConfidenceBadge({
  confidence,
  lowConfidence,
  poseError,
  manuallyConfirmed,
}: ConfidenceBadgeProps) {
  if (poseError) {
    return (
      <Badge dotColor="bg-red-500" bg="bg-red-50" text="text-red-700">
        포즈 미검출
      </Badge>
    );
  }
  if (manuallyConfirmed) {
    return (
      <Badge dotColor="bg-emerald-500" bg="bg-emerald-50" text="text-emerald-700">
        확인됨
      </Badge>
    );
  }
  if (lowConfidence) {
    return (
      <Badge dotColor="bg-amber-500" bg="bg-amber-50" text="text-amber-800">
        확인 필요 ({Math.round(confidence * 100)}%)
      </Badge>
    );
  }
  return (
    <Badge dotColor="bg-slate-400" bg="bg-slate-50" text="text-slate-600">
      {Math.round(confidence * 100)}%
    </Badge>
  );
}
