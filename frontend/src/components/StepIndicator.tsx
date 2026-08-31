import { Link } from "react-router-dom";
import { STEP_ORDER, type WizardStep } from "../utils/derive";

interface StepIndicatorProps {
  sessionId: string | null;
  currentStep: WizardStep;
  reachability: Record<WizardStep, boolean>;
}

export function StepIndicator({ sessionId, currentStep, reachability }: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto py-4">
      {STEP_ORDER.map(({ step, label, path }, idx) => {
        const isCurrent = step === currentStep;
        const reachable = sessionId != null && reachability[step];
        const content = (
          <span
            className={[
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              isCurrent
                ? "bg-brand-700 text-white"
                : reachable
                  ? "border border-brand-200 bg-white text-neutral-700 hover:border-brand-400"
                  : "bg-neutral-100 text-neutral-400",
            ].join(" ")}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs">
              {idx + 1}
            </span>
            {label}
          </span>
        );
        return (
          <li key={step} className="flex items-center gap-2">
            {reachable && sessionId ? <Link to={`/s/${sessionId}/${path}`}>{content}</Link> : content}
            {idx < STEP_ORDER.length - 1 && <span className="text-neutral-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
