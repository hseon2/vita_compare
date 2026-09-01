// backend/state/session_store.py + backend/api/routes/*.py 포팅. 서버 대신 브라우저 IndexedDB에
// 저장한다 - 사진이 어떤 서버로도 전송되지 않는다. api/client.ts가 이 모듈을 호출한다.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DEFAULT_BODY_COMP_LABELS, labelFor } from "../config/compos";
import { proposeCropBox } from "./cropper";
import { detectLandmarks, loadImageFromBlob, PoseNotDetectedError } from "./pose";
import { CONFIDENCE_THRESHOLD } from "./preprocessConfig";
import type {
  BodyCompRowIn,
  CropBox,
  Mode,
  PhotoOut,
  PhotoPatchRequest,
  PhotosGroupedResponse,
  SessionMetaResponse,
  SessionType,
} from "../api/types";

export class ApiError extends Error {
  error_code: string;
  status: number;
  constructor(error_code: string, message: string, status: number) {
    super(message);
    this.error_code = error_code;
    this.status = status;
  }
}

interface StoredSession {
  session_id: string;
  patient_name: string;
  mode: Mode;
  created_at: string;
  session_dates: Record<string, string>;
  body_comp_rows: BodyCompRowIn[];
}

/** backend PhotoRecord와 대응. thumbnail_url/compos_label/low_confidence/duplicate는 저장하지
 * 않고 읽을 때 파생시킨다(backend photo_to_out()과 동일한 원칙). */
export interface StoredPhoto {
  photo_id: string;
  session_id: string;
  session_type: SessionType;
  compos_id: number;
  original_filename: string;
  rotation_deg: number;
  crop_box: CropBox;
  classification_confidence: number;
  manually_confirmed: boolean;
  option_confirmed: boolean;
  pose_error: boolean;
  blob: Blob;
}

interface VitaCompareDB extends DBSchema {
  sessions: { key: string; value: StoredSession };
  photos: { key: string; value: StoredPhoto; indexes: { by_session: string } };
}

let dbPromise: Promise<IDBPDatabase<VitaCompareDB>> | null = null;

function getDb(): Promise<IDBPDatabase<VitaCompareDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VitaCompareDB>("vita-compare", 1, {
      upgrade(db) {
        db.createObjectStore("sessions", { keyPath: "session_id" });
        const photoStore = db.createObjectStore("photos", { keyPath: "photo_id" });
        photoStore.createIndex("by_session", "session_id");
      },
    });
  }
  return dbPromise;
}

const objectUrlCache = new Map<string, string>();

function getObjectUrl(photoId: string, blob: Blob): string {
  let url = objectUrlCache.get(photoId);
  if (!url) {
    url = URL.createObjectURL(blob);
    objectUrlCache.set(photoId, url);
  }
  return url;
}

function revokeObjectUrl(photoId: string): void {
  const url = objectUrlCache.get(photoId);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlCache.delete(photoId);
  }
}

function randomId(len = 10): string {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

async function sessionToMeta(s: StoredSession): Promise<SessionMetaResponse> {
  return {
    session_id: s.session_id,
    patient_name: s.patient_name,
    mode: s.mode,
    created_at: s.created_at,
    session_dates: s.session_dates,
  };
}

export function photoToOut(record: StoredPhoto, duplicate: boolean): PhotoOut {
  return {
    photo_id: record.photo_id,
    session_type: record.session_type,
    original_filename: record.original_filename,
    compos_id: record.compos_id,
    compos_label: record.compos_id > 0 ? labelFor(record.compos_id) : "미분류",
    classification_confidence: record.classification_confidence,
    low_confidence: record.classification_confidence < CONFIDENCE_THRESHOLD,
    manually_confirmed: record.manually_confirmed,
    option_confirmed: record.option_confirmed,
    pose_error: record.pose_error,
    rotation_deg: record.rotation_deg,
    crop_box: record.crop_box,
    thumbnail_url: getObjectUrl(record.photo_id, record.blob),
    duplicate,
  };
}

export function duplicatePhotoIds(records: StoredPhoto[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.compos_id <= 0) continue;
    const key = `${r.session_type}:${r.compos_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dup = new Set<string>();
  for (const r of records) {
    if (r.compos_id <= 0) continue;
    const key = `${r.session_type}:${r.compos_id}`;
    if ((counts.get(key) ?? 0) > 1) dup.add(r.photo_id);
  }
  return dup;
}

function missingCompos(records: StoredPhoto[], mode: Mode): Record<string, number[]> {
  const sessionTypes: SessionType[] = mode === "long" ? ["start", "mid", "end"] : ["start", "end"];
  const assigned: Record<string, Set<number>> = {};
  for (const st of sessionTypes) assigned[st] = new Set();
  for (const r of records) {
    if (r.session_type in assigned && r.compos_id > 0) assigned[r.session_type].add(r.compos_id);
  }
  const result: Record<string, number[]> = {};
  for (const st of sessionTypes) {
    const missing: number[] = [];
    for (let i = 1; i <= 16; i++) if (!assigned[st].has(i)) missing.push(i);
    result[st] = missing;
  }
  return result;
}

// ---- sessions ----

export async function createSession(patientName: string, mode: Mode): Promise<{ session_id: string }> {
  const db = await getDb();
  const session_id = randomId(12);
  const session: StoredSession = {
    session_id,
    patient_name: patientName,
    mode,
    created_at: new Date().toISOString(),
    session_dates: {},
    body_comp_rows: DEFAULT_BODY_COMP_LABELS.map((label) => ({
      label,
      start: "",
      mid: null,
      end: "",
      target: "",
      highlight: false,
    })),
  };
  await db.put("sessions", session);
  return { session_id };
}

export async function getSessionMeta(sessionId: string): Promise<SessionMetaResponse> {
  const db = await getDb();
  const s = await db.get("sessions", sessionId);
  if (!s) throw new ApiError("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`, 404);
  return sessionToMeta(s);
}

export async function patchSessionMeta(
  sessionId: string,
  patch: { patient_name?: string; mode?: Mode },
): Promise<SessionMetaResponse> {
  const db = await getDb();
  const s = await db.get("sessions", sessionId);
  if (!s) throw new ApiError("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`, 404);
  if (patch.patient_name !== undefined) s.patient_name = patch.patient_name;
  if (patch.mode !== undefined) s.mode = patch.mode;
  await db.put("sessions", s);
  return sessionToMeta(s);
}

// ---- photos ----

export async function uploadPhotos(
  sessionId: string,
  sessionType: SessionType,
  sessionDate: string | null,
  files: File[],
): Promise<PhotoOut[]> {
  const db = await getDb();
  const session = await db.get("sessions", sessionId);
  if (!session) throw new ApiError("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`, 404);

  if (sessionDate) {
    session.session_dates[sessionType] = sessionDate;
    await db.put("sessions", session);
  }

  const tx = db.transaction("photos", "readwrite");
  const created: StoredPhoto[] = [];
  for (const f of files) {
    const record: StoredPhoto = {
      photo_id: randomId(10),
      session_id: sessionId,
      session_type: sessionType,
      compos_id: 0,
      original_filename: f.name,
      rotation_deg: 0,
      crop_box: [0, 0, 0, 0],
      classification_confidence: 0,
      manually_confirmed: false,
      option_confirmed: false,
      pose_error: false,
      blob: f,
    };
    await tx.store.put(record);
    created.push(record);
  }
  await tx.done;

  const all = await getPhotosRaw(sessionId);
  const dup = duplicatePhotoIds(all);
  return created.map((r) => photoToOut(r, dup.has(r.photo_id)));
}

export async function getPhotosRaw(sessionId: string): Promise<StoredPhoto[]> {
  const db = await getDb();
  return db.getAllFromIndex("photos", "by_session", sessionId);
}

export async function getPhotos(sessionId: string): Promise<PhotosGroupedResponse> {
  const db = await getDb();
  const session = await db.get("sessions", sessionId);
  if (!session) throw new ApiError("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`, 404);
  const records = await getPhotosRaw(sessionId);
  const dup = duplicatePhotoIds(records);
  return {
    photos: records.map((r) => photoToOut(r, dup.has(r.photo_id))),
    missing_compos: missingCompos(records, session.mode),
  };
}

export async function getPhotoRaw(photoId: string): Promise<StoredPhoto | undefined> {
  const db = await getDb();
  return db.get("photos", photoId);
}

export async function putPhotoRaw(record: StoredPhoto): Promise<void> {
  const db = await getDb();
  await db.put("photos", record);
}

/** backend/api/routes/crop.py의 patch_photo와 동일한 규칙. compos_id만 바뀌고 crop_box가
 * 같이 오지 않으면 새 구도 기준으로 크롭을 다시 제안한다(포즈 미검출이면 pose_error만 세우고
 * crop_box는 손대지 않음 - 생성 시점에 안전한 기본값으로 대체됨). manually_confirmed는 실제
 * 회전/크롭이 바뀔 때만 자동으로 켜진다(오늘 세션에서 고친 버그: 구도/세션타입만 바꿔도
 * 크롭 확정으로 잘못 넘어가던 문제) - option_confirmed와는 완전히 별개 필드. */
export async function patchPhoto(sessionId: string, photoId: string, patch: PhotoPatchRequest): Promise<StoredPhoto> {
  const db = await getDb();
  const record = await db.get("photos", photoId);
  if (!record) throw new ApiError("PHOTO_NOT_FOUND", `사진을 찾을 수 없습니다: ${photoId}`, 404);

  if (patch.session_type !== undefined) record.session_type = patch.session_type;

  if (patch.compos_id !== undefined) {
    record.compos_id = patch.compos_id;
    record.classification_confidence = 1.0;

    if (patch.crop_box === undefined) {
      // 회전은 항상 사람이 슬라이더로 직접 조절한다는 원칙 - 여기서는 자동으로 건드리지 않고
      // 현재 rotation_deg 기준으로만 크롭을 다시 제안한다 (backend crop.py와 동일).
      try {
        const landmarks = await detectLandmarks(record.blob);
        const img = await loadImageFromBlob(record.blob);
        record.crop_box = proposeCropBox(img, landmarks, record.rotation_deg, record.compos_id);
        record.pose_error = false;
      } catch (e) {
        if (e instanceof PoseNotDetectedError) record.pose_error = true;
        else throw e;
      }
    }
  }

  let cropChanged = false;
  if (patch.rotation_deg !== undefined) {
    record.rotation_deg = patch.rotation_deg;
    cropChanged = true;
  }
  if (patch.crop_box !== undefined) {
    record.crop_box = patch.crop_box;
    cropChanged = true;
  }

  if (patch.manually_confirmed !== undefined) record.manually_confirmed = patch.manually_confirmed;
  else if (cropChanged) record.manually_confirmed = true;

  if (patch.option_confirmed !== undefined) record.option_confirmed = patch.option_confirmed;

  await db.put("photos", record);

  // sync_size(기본 true) - 같은 구도(compos_id)의 다른 사진들도 크기만 맞춘다(위치는 각자 유지).
  if (patch.crop_box !== undefined && patch.sync_size !== false && record.compos_id > 0) {
    const [x0, y0, x1, y1] = patch.crop_box;
    const newW = x1 - x0;
    const newH = y1 - y0;
    const siblings = await getPhotosRaw(sessionId);
    for (const other of siblings) {
      if (other.photo_id === photoId || other.compos_id !== record.compos_id) continue;
      const [ox0, oy0, ox1, oy1] = other.crop_box;
      const ocx = (ox0 + ox1) / 2;
      const ocy = (oy0 + oy1) / 2;
      other.crop_box = [
        Math.max(0, Math.round(ocx - newW / 2)),
        Math.max(0, Math.round(ocy - newH / 2)),
        Math.max(0, Math.round(ocx + newW / 2)),
        Math.max(0, Math.round(ocy + newH / 2)),
      ];
      await db.put("photos", other);
    }
  }

  return record;
}

export async function deletePhoto(photoId: string): Promise<void> {
  const db = await getDb();
  await db.delete("photos", photoId);
  revokeObjectUrl(photoId);
}

// ---- body comp ----

export async function getBodyComp(sessionId: string): Promise<{ rows: BodyCompRowIn[] }> {
  const db = await getDb();
  const s = await db.get("sessions", sessionId);
  if (!s) throw new ApiError("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`, 404);
  return { rows: s.body_comp_rows };
}

export async function saveBodyComp(sessionId: string, rows: BodyCompRowIn[]): Promise<void> {
  const db = await getDb();
  const s = await db.get("sessions", sessionId);
  if (!s) throw new ApiError("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${sessionId}`, 404);
  s.body_comp_rows = rows;
  await db.put("sessions", s);
}
