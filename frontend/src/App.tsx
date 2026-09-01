import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { WizardLayout } from "./layouts/WizardLayout";
import { CropAdjustPage } from "./pages/CropAdjustPage";
import { GeneratePage } from "./pages/GeneratePage";
import { MatchConfirmPage } from "./pages/MatchConfirmPage";
import { OptionSelectPage } from "./pages/OptionSelectPage";
import { UploadPage } from "./pages/UploadPage";

// "/s/:sessionId"만 왔을 때 "/s/:sessionId/upload"로, "classify"로 왔을 때 "options"로 보낸다.
// (상대경로 Navigate 대신 절대경로로 직접 만들어서 라우트 중첩 구조와 무관하게 항상 정확히 이동한다)
function IndexRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <Navigate to={`/s/${sessionId}/upload`} replace />;
}
function ClassifyRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <Navigate to={`/s/${sessionId}/options`} replace />;
}

function App() {
  return (
    <Routes>
      {/* "/"(세션 생성 전)과 "/s/:id/*"(세션 생성 후) 전부 같은 WizardLayout(헤더+스텝 인디케이터)
          아래에서 렌더된다 - 예전엔 "/"만 레이아웃이 달라서 마치 다른 화면처럼 보였다. */}
      <Route element={<WizardLayout />}>
        <Route path="/" element={<UploadPage />} />
        <Route path="/s/:sessionId" element={<IndexRedirect />} />
        <Route path="/s/:sessionId/upload" element={<UploadPage />} />
        {/* 예전 경로 호환용 - "분류 확인" 화면은 이제 OptionSelectPage(옵션 선택)다 */}
        <Route path="/s/:sessionId/classify" element={<ClassifyRedirect />} />
        <Route path="/s/:sessionId/options" element={<OptionSelectPage />} />
        <Route path="/s/:sessionId/crop" element={<CropAdjustPage />} />
        <Route path="/s/:sessionId/match" element={<MatchConfirmPage />} />
        <Route path="/s/:sessionId/generate" element={<GeneratePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
