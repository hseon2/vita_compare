// backend/api/routes/*.py 전체를 포팅. 함수 시그니처/반환 shape은 기존과 동일하게 유지해서
// frontend/src/hooks/*.ts와 페이지 컴포넌트를 그대로 재사용한다 - fetch() 대신
// frontend/src/lib/db.ts(IndexedDB)와 lib/pose.ts, lib/classifier.ts, lib/cropper.ts,
// lib/pptGenerator.ts(브라우저 내 연산)를 호출할 뿐, 사진이 어떤 서버로도 전송되지 않는다.
import * as db from "../lib/db";
import { classify } from "../lib/classifier";
import { detectLandmarks, loadImageFromBlob, PoseNotDetectedError } from "../lib/pose";
import { defaultCropBoxForImage } from "../lib/cropper";
import { generatePresentation } from "../lib/pptGenerator";
import { CONFIDENCE_THRESHOLD } from "../lib/preprocessConfig";
import type {
  BodyCompRowIn,
  ClassifyResponse,
  ClassifyWarning,
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

export { ApiError } from "../lib/db";

interface GenerateEntry {
  status: GenerateStatusOut;
  blob: Blob | null;
  objectUrl: string | null;
}

const generateEntries = new Map<string, GenerateEntry>();

function getGenerateEntry(sessionId: string): GenerateEntry {
  let entry = generateEntries.get(sessionId);
  if (!entry) {
    entry = { status: { state: "idle", progress: 0, message: "", result_path: null }, blob: null, objectUrl: null };
    generateEntries.set(sessionId, entry);
  }
  return entry;
}

/** 업로드 직후엔 미분류 상태인 사진을 순회하며 포즈검출 -> 구도분류까지 채운다 (backend
 * classify.py 포팅. 자동 수평조정/자동크롭은 사용자 요청으로 제거 - 회전은 항상 0에서 시작해
 * 사람이 슬라이더로 조절하고, 크롭은 항상 "이미지 전체를 구도 비율로 중앙 크롭"에서 시작해
 * 사람이 직접 조정한다). 이미 사람이 확정한(option_confirmed) 사진은 건너뛴다 - 사진을
 * 추가로 올린 뒤 재호출해도 기존 확정값을 덮어쓰지 않는다. */
async function classifySession(sessionId: string): Promise<ClassifyResponse> {
  const records = await db.getPhotosRaw(sessionId);
  const warnings: ClassifyWarning[] = [];

  for (const record of records) {
    if (record.option_confirmed) continue;

    try {
      const landmarks = await detectLandmarks(record.blob);
      record.pose_error = false;

      const [composId, confidence] = classify(landmarks);
      record.compos_id = composId;
      record.classification_confidence = confidence;
      record.manually_confirmed = false;

      const img = await loadImageFromBlob(record.blob);
      record.crop_box = defaultCropBoxForImage(img, composId);

      if (confidence < CONFIDENCE_THRESHOLD) {
        warnings.push({
          photo_id: record.photo_id,
          error_code: "LOW_CONFIDENCE",
          message: `분류 신뢰도가 낮습니다 (${confidence.toFixed(2)}) - 확인이 필요합니다.`,
        });
      }
    } catch (e) {
      if (e instanceof PoseNotDetectedError) {
        record.pose_error = true;
        record.compos_id = 0;
        record.classification_confidence = 0;
        warnings.push({
          photo_id: record.photo_id,
          error_code: "POSE_NOT_DETECTED",
          message: `인물을 검출하지 못했습니다: ${record.original_filename}`,
        });
      } else {
        throw e;
      }
    }

    await db.putPhotoRaw(record);
  }

  const grouped = await db.getPhotos(sessionId);
  return { photos: grouped.photos, warnings };
}

/** PPT 생성을 비동기로 시작하고 진행상태를 generateEntries에 반영한다 (backend
 * run_generate_job의 클라이언트 버전 - BackgroundTasks 대신 그냥 fire-and-forget). */
async function runGenerateJob(sessionId: string): Promise<void> {
  const entry = getGenerateEntry(sessionId);
  try {
    const [meta, photos, bodyComp] = await Promise.all([
      db.getSessionMeta(sessionId),
      db.getPhotosRaw(sessionId),
      db.getBodyComp(sessionId),
    ]);

    const blob = await generatePresentation(meta.mode, photos, meta.session_dates, bodyComp.rows, (p) => {
      entry.status = { ...entry.status, progress: p.progress, message: p.message };
    });

    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    entry.blob = blob;
    entry.objectUrl = URL.createObjectURL(blob);

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const fileName = `${meta.patient_name}님_프레젠테이션_${dateStr}.pptx`;

    entry.status = { state: "done", progress: 1.0, message: "완료", result_path: fileName };
  } catch (e) {
    entry.status = { state: "error", progress: entry.status.progress, message: e instanceof Error ? e.message : String(e), result_path: null };
  }
}

export const api = {
  createSession: (patientName: string, mode: Mode): Promise<SessionCreateResponse> => db.createSession(patientName, mode),

  getSessionMeta: (sessionId: string): Promise<SessionMetaResponse> => db.getSessionMeta(sessionId),

  patchSessionMeta: (sessionId: string, patch: SessionPatchRequest): Promise<SessionMetaResponse> =>
    db.patchSessionMeta(sessionId, patch),

  uploadPhotos: (sessionId: string, sessionType: SessionType, sessionDate: string | null, files: File[]): Promise<PhotoOut[]> =>
    db.uploadPhotos(sessionId, sessionType, sessionDate, files),

  getPhotos: (sessionId: string): Promise<PhotosGroupedResponse> => db.getPhotos(sessionId),

  classifySession: (sessionId: string): Promise<ClassifyResponse> => classifySession(sessionId),

  patchPhoto: async (sessionId: string, photoId: string, patch: PhotoPatchRequest): Promise<PhotoOut> => {
    const record = await db.patchPhoto(sessionId, photoId, patch);
    const all = await db.getPhotosRaw(sessionId);
    const dup = db.duplicatePhotoIds(all);
    return db.photoToOut(record, dup.has(record.photo_id));
  },

  deletePhoto: (_sessionId: string, photoId: string): Promise<void> => db.deletePhoto(photoId),

  movePhoto: (sessionId: string, photoId: string, direction: "prev" | "next"): Promise<void> =>
    db.movePhoto(sessionId, photoId, direction),

  reorderPhotos: (_sessionId: string, photoIds: string[]): Promise<void> => db.reorderPhotos(photoIds),

  getBodyComp: (sessionId: string): Promise<{ rows: BodyCompRowIn[] }> => db.getBodyComp(sessionId),

  saveBodyComp: async (sessionId: string, rows: BodyCompRowIn[]): Promise<{ ok: true }> => {
    await db.saveBodyComp(sessionId, rows);
    return { ok: true };
  },

  startGenerate: (sessionId: string): Promise<{ ok: true }> => {
    const entry = getGenerateEntry(sessionId);
    if (entry.status.state !== "running") {
      entry.status = { state: "running", progress: 0.05, message: "사진 정리 중", result_path: null };
      void runGenerateJob(sessionId);
    }
    return Promise.resolve({ ok: true });
  },

  getGenerateStatus: (sessionId: string): Promise<GenerateStatusOut> => Promise.resolve(getGenerateEntry(sessionId).status),

  downloadUrl: (sessionId: string): string => getGenerateEntry(sessionId).objectUrl ?? "",
};
