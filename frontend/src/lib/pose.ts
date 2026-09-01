// backend/preprocessing/pose_detector.py 포팅. mediapipe python Tasks API 대신
// @mediapipe/tasks-vision(WASM, 브라우저 내 추론)을 쓴다 - 사진이 어떤 서버로도 전송되지 않는다.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { POSE_MIN_DETECTION_CONFIDENCE, POSE_MODEL_URL } from "./preprocessConfig";

// backend/preprocessing/pose_detector.py의 LANDMARK_NAMES와 동일 (mediapipe.tasks.python.vision.PoseLandmark
// enum 순서를 그대로 미러). BlazePose 33포인트 표준 토폴로지라 모델이 바뀌지 않는 한 고정된 순서다.
export const LANDMARK_NAMES = [
  "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER", "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER",
  "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
  "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST",
  "LEFT_PINKY", "RIGHT_PINKY", "LEFT_INDEX", "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB",
  "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE",
  "LEFT_HEEL", "RIGHT_HEEL", "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
] as const;

/** name -> (x, y, z, visibility), 정규화 좌표(0~1). backend PhotoRecord와 동일한 포맷. */
export type Landmarks = Record<string, [number, number, number, number]>;

export class PoseNotDetectedError extends Error {
  constructor(detail: string) {
    super(`인물을 검출하지 못했습니다: ${detail}`);
    this.name = "PoseNotDetectedError";
  }
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** PoseLandmarker는 모델 로딩 비용이 커서 탭당 한 번만 생성해 재사용한다 (backend의
 * _get_landmarker() 싱글턴 패턴과 동일). */
function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL },
        runningMode: "IMAGE",
        numPoses: 1,
        minPoseDetectionConfidence: POSE_MIN_DETECTION_CONFIDENCE,
      });
    })();
  }
  return landmarkerPromise;
}

/** Blob(업로드된 원본 사진)을 디코드된 HTMLImageElement로 로드한다. 크롭/PPT 익스포트에서도
 * 재사용하는 공용 유틸. */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 불러올 수 없습니다."));
    };
    img.src = url;
  });
}

/** 이미지에서 33개 랜드마크 좌표를 추출. 인물이 검출되지 않거나 이미지를 읽을 수 없으면
 * PoseNotDetectedError를 던진다. */
export async function detectLandmarks(blob: Blob): Promise<Landmarks> {
  let img: HTMLImageElement;
  try {
    img = await loadImageFromBlob(blob);
  } catch (e) {
    throw new PoseNotDetectedError(e instanceof Error ? e.message : String(e));
  }

  const landmarker = await getLandmarker();
  const result = landmarker.detect(img);

  if (!result.landmarks || result.landmarks.length === 0) {
    throw new PoseNotDetectedError("no pose landmarks");
  }

  const points = result.landmarks[0];
  const landmarks: Landmarks = {};
  LANDMARK_NAMES.forEach((name, i) => {
    const lm = points[i];
    landmarks[name] = [lm.x, lm.y, lm.z, lm.visibility ?? 0];
  });
  return landmarks;
}
