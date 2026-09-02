import { Link } from "react-router-dom";
import { STEP_ORDER, type WizardStep } from "../utils/derive";

interface StepIndicatorProps {
  sessionId: string | null;
  currentStep: WizardStep;
  reachability: Record<WizardStep, boolean>;
}

export function StepIndicator({ sessionId, currentStep, reachability }: StepIndicatorProps) {
  return (
    <ol
      className="flex items-center gap-1.5 overflow-x-auto pt-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {STEP_ORDER.map(({ step, label, path }, idx) => {
        const isCurrent = step === currentStep;
        const reachable = sessionId != null && reachability[step];
        const content = (
          <span
            className={[
              "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[13px] font-medium whitespace-nowrap transition-colors",
              isCurrent
                ? "bg-brand-700 text-white"
                : reachable
                  ? "border border-neutral-200 bg-white text-neutral-700 hover:border-brand-300"
                  : "bg-neutral-100 text-neutral-400",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs leading-none font-semibold",
                isCurrent ? "bg-white text-brand-700" : reachable ? "bg-brand-50 text-brand-700" : "bg-neutral-200 text-neutral-400",
              ].join(" ")}
            >
              {idx + 1}
            </span>
            {label}
          </span>
        );
        return (
          <li key={step} className="flex items-center gap-1.5">
            {reachable && sessionId ? <Link to={`/s/${sessionId}/${path}`}>{content}</Link> : content}
            {idx < STEP_ORDER.length - 1 && <span className="text-neutral-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
