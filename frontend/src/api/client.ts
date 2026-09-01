import type {
  BodyCompGetResponse,
  BodyCompRowIn,
  GenerateStatusOut,
  Mode,
  PhotoOut,
  PhotoPatchRequest,
  PhotosGroupedResponse,
  SessionCreateResponse,
  SessionMetaResponse,
  SessionPatchRequest,
  SessionType,
} from "./types";

// 빈 문자열이면 Vite 프록시(/api, /static → localhost:8000)를 그대로 사용.
// 프록시 없이 배포할 상황이 생기면 이 값만 바꾸면 됨.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  error_code: string;
  status: number;

  constructor(error_code: string, message: string, status: number) {
    super(message);
    this.error_code = error_code;
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error_code: "UNKNOWN", message: res.statusText }));
    throw new ApiError(body.error_code ?? "UNKNOWN", body.message ?? res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  createSession: (patientName: string, mode: Mode) =>
    apiFetch<SessionCreateResponse>("/api/sessions", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ patient_name: patientName, mode }),
    }),

  getSessionMeta: (sessionId: string) =>
    apiFetch<SessionMetaResponse>(`/api/sessions/${sessionId}`),

  patchSessionMeta: (sessionId: string, patch: SessionPatchRequest) =>
    apiFetch<SessionMetaResponse>(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }),

  uploadPhotos: (
    sessionId: string,
    sessionType: SessionType,
    sessionDate: string | null,
    files: File[],
  ) => {
    const fd = new FormData();
    fd.append("session_type", sessionType);
    if (sessionDate) fd.append("session_date", sessionDate);
    files.forEach((f) => fd.append("files", f));
    // Content-Type을 직접 지정하지 않는다 - 브라우저가 multipart boundary를 자동으로 채워줌
    return apiFetch<PhotoOut[]>(`/api/sessions/${sessionId}/photos`, {
      method: "POST",
      body: fd,
    });
  },

  getPhotos: (sessionId: string) =>
    apiFetch<PhotosGroupedResponse>(`/api/sessions/${sessionId}/photos`),

  patchPhoto: (sessionId: string, photoId: string, patch: PhotoPatchRequest) =>
    apiFetch<PhotoOut>(`/api/sessions/${sessionId}/photos/${photoId}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }),

  deletePhoto: (sessionId: string, photoId: string) =>
    apiFetch<void>(`/api/sessions/${sessionId}/photos/${photoId}`, { method: "DELETE" }),

  getBodyComp: (sessionId: string) =>
    apiFetch<BodyCompGetResponse>(`/api/sessions/${sessionId}/body-comp`),

  saveBodyComp: (sessionId: string, rows: BodyCompRowIn[]) =>
    apiFetch<{ ok: true }>(`/api/sessions/${sessionId}/body-comp`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ rows }),
    }),

  startGenerate: (sessionId: string) =>
    apiFetch<{ ok: true }>(`/api/sessions/${sessionId}/generate`, { method: "POST" }),

  getGenerateStatus: (sessionId: string) =>
    apiFetch<GenerateStatusOut>(`/api/sessions/${sessionId}/generate/status`),

  downloadUrl: (sessionId: string) => `${API_BASE}/api/sessions/${sessionId}/download`,
};
