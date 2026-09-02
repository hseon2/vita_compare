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

  // 업로드 화면은 사진 그리드가 아니라 순차 입력 폼이라 좁은 폭이 더 잘 어울린다 - 그 폭에
  // 헤더(로고+스텝 인디케이터)도 같이 맞춰서 헤더만 넓고 본문만 좁아 보이는 어긋남을 없앤다.
  // 다른 스텝(옵션선택/크롭 등)은 사진을 나란히 비교해야 해서 기존 넓은 폭을 유지한다.
  const containerMaxWidth = currentStep === "upload" ? "max-w-xl" : "max-w-5xl";

  return (
    <div className={`mx-auto ${containerMaxWidth} px-4 pb-16 transition-[max-width]`}>
      <header className="pt-8">
        <Link to="/" className="inline-flex items-center text-lg font-bold text-brand-800">
          thebeautycl
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
