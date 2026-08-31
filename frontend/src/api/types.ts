// backend/api/schemas.py 를 1:1로 미러한다. 백엔드 스키마가 바뀌면 이 파일도 함께 바꿀 것.

export type SessionType = "start" | "mid" | "end";
export type Mode = "standard" | "long";
export type CropBox = [number, number, number, number]; // [x0, y0, x1, y1], 회전 후 이미지 픽셀 기준

export interface SessionCreateRequest {
  patient_name: string;
  mode: Mode;
}

export interface SessionCreateResponse {
  session_id: string;
}

export interface SessionPatchRequest {
  patient_name?: string;
  mode?: Mode;
}

export interface SessionMetaResponse {
  session_id: string;
  patient_name: string;
  mode: Mode;
  created_at: string;
  session_dates: Record<string, string>;
}

export interface PhotoOut {
  photo_id: string;
  session_type: SessionType;
  compos_id: number; // 0 = 미분류
  compos_label: string;
  classification_confidence: number;
  low_confidence: boolean;
  manually_confirmed: boolean;
  pose_error: boolean;
  rotation_deg: number;
  crop_box: CropBox; // [0,0,0,0] = 아직 AI 크롭 전
  thumbnail_url: string;
  duplicate: boolean;
}

export interface PhotosGroupedResponse {
  photos: PhotoOut[];
  missing_compos: Record<string, number[]>;
}

export type ClassifyErrorCode = "POSE_NOT_DETECTED" | "LOW_CONFIDENCE";

export interface ClassifyWarning {
  photo_id: string;
  error_code: ClassifyErrorCode;
  message: string;
}

export interface ClassifyResponse {
  photos: PhotoOut[];
  warnings: ClassifyWarning[];
}

export interface PhotoPatchRequest {
  compos_id?: number;
  rotation_deg?: number;
  crop_box?: CropBox;
  manually_confirmed?: boolean;
  sync_size?: boolean; // 서버 기본값 true
}

export interface BodyCompRowIn {
  label: string;
  start: string;
  mid: string | null;
  end: string;
  target: string;
  highlight: boolean;
}

export interface BodyCompGetResponse {
  rows: BodyCompRowIn[];
}

export type GenerateState = "idle" | "running" | "done" | "error";

export interface GenerateStatusOut {
  state: GenerateState;
  progress: number;
  message: string;
  result_path: string | null;
}

export interface ErrorResponse {
  error_code: string;
  message: string;
}
