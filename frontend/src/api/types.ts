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
  original_filename: string;
  width: number; // 원본 이미지 픽셀 크기 - 백엔드 스키마엔 없는 프론트 전용 필드(크롭 화면에서
  height: number; // "두 사진 크기가 같으면 크롭도 동일하게" 판단에 사용)
  compos_id: number; // 0 = 미분류
  compos_label: string;
  classification_confidence: number;
  low_confidence: boolean;
  manually_confirmed: boolean;
  option_confirmed: boolean;
  pose_error: boolean;
  rotation_deg: number;
  crop_box: CropBox; // [0,0,0,0] = 아직 AI 크롭 전
  thumbnail_url: string;
  duplicate: boolean;
  // PPT 슬라이드에 실제로 들어갈 크기 배율(1.0 = 화면에 꽉 차게 자동 맞춤, 작을수록 슬라이드
  // 안에서 작게 표시됨) - 백엔드 스키마엔 없는 프론트 전용 필드.
  slide_scale: number;
  // 전/후 두 사진을 가운데(세로 중심선)에서 좌우로 얼마나 더 벌려 놓을지(in, 0=자동 배치
  // 그대로) - 이미지 크기를 키우면 서로 겹쳐 보이는 문제를 이걸로 보정한다.
  slide_spread: number;
}

export interface PhotosGroupedResponse {
  photos: PhotoOut[];
  missing_compos: Record<string, number[]>;
}

export interface ClassifyWarning {
  photo_id: string;
  error_code: string;
  message: string;
}

export interface ClassifyResponse {
  photos: PhotoOut[];
  warnings: ClassifyWarning[];
}

export interface PhotoPatchRequest {
  compos_id?: number;
  session_type?: SessionType;
  rotation_deg?: number;
  crop_box?: CropBox;
  manually_confirmed?: boolean;
  option_confirmed?: boolean;
  sync_size?: boolean; // 서버 기본값 true
  slide_scale?: number;
  slide_spread?: number;
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
