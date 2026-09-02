// backend/state/session_store.py + backend/api/routes/*.py 포팅. 서버 대신 브라우저 IndexedDB에
// 저장한다 - 사진이 어떤 서버로도 전송되지 않는다. api/client.ts가 이 모듈을 호출한다.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DEFAULT_BODY_COMP_LABELS, labelFor } from "../config/compos";
import { defaultCropBoxForDims } from "./cropper";
import { loadImageFromBlob } from "./pose";
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
  // photo_id는 무작위 문자열이라 생성 순서를 반영하지 않는다(정렬용으로 쓰면 안 됨) - 업로드
  // 순서(=나중에 추가한 사진이 뒤로 가는 것)를 보장하려면 이 값으로 정렬해야 한다.
  created_at: number;
  session_type: SessionType;
  compos_id: number;
  original_filename: string;
  width: number;
  height: number;
  rotation_deg: number;
  crop_box: CropBox;
  classification_confidence: number;
  manually_confirmed: boolean;
  option_confirmed: boolean;
  pose_error: boolean;
  // PPT 슬라이드 안에서의 크기 배율(1.0 = 화면 꽉 차게 자동 맞춤) - 크롭 화면에서 조정.
  slide_scale: number;
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
    width: record.width,
    height: record.height,
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
    slide_scale: record.slide_scale ?? 1,
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

  // 이미지 크기(width/height)는 크롭 화면에서 "두 사진 크기가 같으면 크롭도 동일하게 맞추기"
  // 판단에 쓴다 - 디코딩이 느려서(IndexedDB 트랜잭션을 깨뜨림) 트랜잭션 시작 전에 미리 구한다.
  const sizes = await Promise.all(
    files.map(async (f) => {
      const img = await loadImageFromBlob(f);
      return { width: img.naturalWidth, height: img.naturalHeight };
    }),
  );

  const tx = db.transaction("photos", "readwrite");
  const created: StoredPhoto[] = [];
  files.forEach((f, i) => {
    const record: StoredPhoto = {
      photo_id: randomId(10),
      session_id: sessionId,
      // 업로드한 시각이 아니라 사진이 실제로 찍힌 시각(파일 lastModified) 기준으로 정렬한다 -
      // groupFilesByDate와 같은 기준. 같은 값이 겹치면(연사 등) 선택한 순서로 안정 정렬되도록
      // 아주 작은 값을 더한다.
      created_at: f.lastModified + i * 0.001,
      session_type: sessionType,
      compos_id: 0,
      original_filename: f.name,
      width: sizes[i].width,
      height: sizes[i].height,
      rotation_deg: 0,
      crop_box: [0, 0, 0, 0],
      classification_confidence: 0,
      manually_confirmed: false,
      option_confirmed: false,
      pose_error: false,
      slide_scale: 1,
      blob: f,
    };
    created.push(record);
  });
  await Promise.all([...created.map((record) => tx.store.put(record)), tx.done]);

  const all = await getPhotosRaw(sessionId);
  const dup = duplicatePhotoIds(all);
  return created.map((r) => photoToOut(r, dup.has(r.photo_id)));
}

export async function getPhotosRaw(sessionId: string): Promise<StoredPhoto[]> {
  const db = await getDb();
  const records = await db.getAllFromIndex("photos", "by_session", sessionId);
  // IndexedDB 인덱스 순서는 생성 순서를 보장하지 않는다 - 업로드한 순서대로(나중에 추가한
  // 사진이 뒤로) 보이도록 항상 created_at 기준으로 정렬해서 반환한다.
  return records.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
}

/** 같은 촬영 시점(session_type) 안에서 사진을 한 칸 앞/뒤로 옮긴다 - 촬영일(파일 시각) 기준
 * 자동 정렬이 실제 순서와 어긋날 때 사람이 직접 바로잡을 수 있게 한다. 옆 사진과
 * created_at을 맞바꾸는 방식이라 다른 사진들 순서에는 영향이 없다. */
export async function movePhoto(sessionId: string, photoId: string, direction: "prev" | "next"): Promise<void> {
  const all = await getPhotosRaw(sessionId);
  const record = all.find((p) => p.photo_id === photoId);
  if (!record) return;
  const siblings = all.filter((p) => p.session_type === record.session_type);
  const idx = siblings.findIndex((p) => p.photo_id === photoId);
  const swapIdx = direction === "prev" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const other = siblings[swapIdx];
  const db = await getDb();
  const tx = db.transaction("photos", "readwrite");
  const aCreatedAt = record.created_at;
  record.created_at = other.created_at;
  other.created_at = aCreatedAt;
  await Promise.all([tx.store.put(record), tx.store.put(other), tx.done]);
}

/** 드래그로 순서를 바꿨을 때 - 주어진 순서대로 created_at을 다시 순차 부여한다(값 자체보다
 * 상대적 순서만 의미 있음). photoIds는 보통 한 세션타입 안의 전체 목록이지만, 일부만 와도
 * 그 안에서의 상대 순서만 그대로 반영된다. */
export async function reorderPhotos(photoIds: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("photos", "readwrite");
  const baseTime = Date.now();
  for (let i = 0; i < photoIds.length; i++) {
    const record = await tx.store.get(photoIds[i]);
    if (record) {
      record.created_at = baseTime + i;
      await tx.store.put(record);
    }
  }
  await tx.done;
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

/** backend/api/routes/crop.py의 patch_photo와 대응 (자동 크롭 제안 부분은 사용자 요청으로
 * 제거 - compos_id만 바뀌고 crop_box가 같이 오지 않으면 항상 "이미지 전체를 구도 비율로
 * 중앙 크롭"한 기본값을 쓴다). manually_confirmed는 실제 회전/크롭이 바뀔 때만 자동으로
 * 켜진다(구도/세션타입만 바꿔도 크롭 확정으로 잘못 넘어가던 버그의 수정) - option_confirmed와는
 * 완전히 별개 필드. */
export async function patchPhoto(sessionId: string, photoId: string, patch: PhotoPatchRequest): Promise<StoredPhoto> {
  const db = await getDb();
  const record = await db.get("photos", photoId);
  if (!record) throw new ApiError("PHOTO_NOT_FOUND", `사진을 찾을 수 없습니다: ${photoId}`, 404);

  if (patch.session_type !== undefined) record.session_type = patch.session_type;

  if (patch.compos_id !== undefined) {
    record.compos_id = patch.compos_id;
    record.classification_confidence = 1.0;
    // 포즈 미검출로 AI 분류가 실패했던 사진이라도, 사람이 직접 구도를 골라 확정하면 더 이상
    // "포즈 미검출" 배지를 보여줄 이유가 없다 - 이 플래그가 안 지워지면 확정 후에도 배지가
    // 계속 "포즈 미검출"로 남아 저장이 안 된 것처럼 보인다(실사용 중 발견).
    record.pose_error = false;

    if (patch.crop_box === undefined) {
      // 업로드 때 이미 구해둔 width/height로 계산한다(이미지를 다시 디코딩하지 않는다) -
      // HEIC 등 브라우저가 못 읽는 형식의 사진에서 디코딩이 실패해 저장 자체가 조용히
      // 실패하고 "다음" 버튼이 반응 없는 것처럼 보이는 문제가 있었다.
      record.crop_box = defaultCropBoxForDims(record.width, record.height, record.compos_id);
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
  if (patch.slide_scale !== undefined) record.slide_scale = patch.slide_scale;

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
