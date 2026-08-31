import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { StepIndicator } from "../components/StepIndicator";
import { usePhotos } from "../hooks/usePhotos";
import { computeReachability, STEP_ORDER, type WizardStep } from "../utils/derive";
import { clearLastSessionId } from "../utils/sessionCache";

export function WizardLayout() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const photosQuery = usePhotos(sessionId);
  // 라우트가 "crop"/"classify" 같은 리터럴 세그먼트라 :step 파라미터가 없다 - 경로 마지막
  // 세그먼트로 현재 스텝을 직접 판별한다.
  const step = location.pathname.split("/").filter(Boolean).pop();

  useEffect(() => {
    if (photosQuery.error instanceof ApiError && photosQuery.error.status === 404) {
      clearLastSessionId(sessionId);
      navigate("/", { replace: true });
    }
  }, [photosQuery.error, sessionId, navigate]);

  const reachability = computeReachability(photosQuery.data);
  const currentStep = (STEP_ORDER.find((s) => s.path === step)?.step ?? "upload") as WizardStep;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="pt-6">
        <Link to="/" className="text-lg font-bold text-neutral-900">
          Vita Compare
        </Link>
        <StepIndicator sessionId={sessionId ?? null} currentStep={currentStep} reachability={reachability} />
      </header>
      <main>
        {photosQuery.error instanceof ApiError && photosQuery.error.status === 404 ? (
          <p className="py-8 text-sm text-red-600">세션이 만료되었거나 존재하지 않습니다. 처음으로 이동합니다...</p>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
