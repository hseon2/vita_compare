import { Navigate, Route, Routes } from "react-router-dom";
import { WizardLayout } from "./layouts/WizardLayout";
import { ClassifyReviewPage } from "./pages/ClassifyReviewPage";
import { CropAdjustPage } from "./pages/CropAdjustPage";
import { GeneratePage } from "./pages/GeneratePage";
import { MatchConfirmPage } from "./pages/MatchConfirmPage";
import { NewSessionPage } from "./pages/NewSessionPage";
import { UploadPage } from "./pages/UploadPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<NewSessionPage />} />
      <Route path="/s/:sessionId" element={<WizardLayout />}>
        <Route index element={<Navigate to="upload" replace />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="classify" element={<ClassifyReviewPage />} />
        <Route path="crop" element={<CropAdjustPage />} />
        <Route path="match" element={<MatchConfirmPage />} />
        <Route path="generate" element={<GeneratePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
