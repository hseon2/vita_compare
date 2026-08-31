// GET /api/sessions/{id}, GET /api/sessions/{id}/body-comp가 이미 서버측 진실을 제공하므로
// (백엔드 소폭 추가로 이 갭은 닫혔음), localStorage는 "/"에 도착했을 때 "이어하기"를 제안하는
// 최소한의 편의 기능으로만 쓴다 - 세션 데이터 자체의 백업 저장소가 아니다.

const LAST_SESSION_KEY = "diet-ppt:lastSessionId";

export function getLastSessionId(): string | null {
  return localStorage.getItem(LAST_SESSION_KEY);
}

export function setLastSessionId(id: string): void {
  localStorage.setItem(LAST_SESSION_KEY, id);
}

export function clearLastSessionId(sessionId?: string): void {
  if (sessionId && getLastSessionId() !== sessionId) return;
  localStorage.removeItem(LAST_SESSION_KEY);
}
