// backend/ppt_generator/generate_ppt.py + backend/services/generate_service.py 포팅.
// python-pptx 대신 pptxgenjs로 브라우저에서 직접 .pptx Blob을 만든다 - 사진이 어떤 서버로도
// 전송되지 않는다. 레이아웃 수식(전/후 나란히 붙이기, 5·15번 대각선 배치, 표 스타일)은
// generate_ppt.py에서 이미 확정된 사양을 그대로 옮겼다.
import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import { COMPOS, WIDE_COMPOS } from "../config/compos";
import { getSetPairing } from "../utils/derive";
import { type CroppedImage, exportCroppedImage } from "./cropper";
import { loadImageFromBlob } from "./pose";
import { computePhotoSlideLayout, SLIDE_W } from "./slideLayout";
import type { StoredPhoto } from "./db";
import type { BodyCompRowIn, Mode } from "../api/types";

const DARK = "282826";
const LINE = "C8C6C0";
const RED = "C83030";
const TARGET_FILL = "F7DDEC";
const HEADER_FILL = "D9EEF5";

function addGuideTag(slide: pptxgen.Slide, text: string): void {
  slide.addText(text, {
    x: 0.3, y: 0.2, w: 6.5, h: 0.5,
    fontSize: 18, bold: true, color: DARK,
    fill: { color: "FFFFFF" },
    line: { color: LINE, width: 1 },
    margin: [4, 8, 4, 8],
  });
}

function addPhotoAt(slide: pptxgen.Slide, dataUrl: string, x: number, y: number, w: number, h: number, dateText?: string): void {
  slide.addImage({ data: dataUrl, x, y, w, h });
  if (dateText) {
    slide.addText(dateText, {
      x, y: y + h + 0.05, w, h: 0.35,
      align: "center", fontFace: "맑은 고딕", fontSize: 20, color: DARK,
    });
  }
}

function addPhotoSlide(
  pres: pptxgen,
  num: number,
  label: string,
  before: CroppedImage,
  after: CroppedImage,
  beforeDate: string | undefined,
  afterDate: string | undefined,
  showDates: boolean,
  wide: boolean,
): void {
  const slide = pres.addSlide();
  addGuideTag(slide, `${num}. ${label}`);

  // components/PptSlidePreview.tsx가 크롭 화면에서 이 함수와 완전히 동일한 결과를 보여준다.
  const layout = computePhotoSlideLayout(before, after, wide, showDates);

  addPhotoAt(slide, before.dataUrl, layout.before.x, layout.before.y, layout.before.w, layout.before.h, showDates ? beforeDate : undefined);
  addPhotoAt(slide, after.dataUrl, layout.after.x, layout.after.y, layout.after.w, layout.after.h, showDates ? afterDate : undefined);
}

function parseValue(text: string | null | undefined): [number | null, string] {
  if (text === null || text === undefined || text === "") return [null, ""];
  const m = String(text).match(/^\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return [null, String(text)];
  return [parseFloat(m[1]), m[2].trim()];
}

/** '67.3kg','59.2kg' -> '-8.1kg'. backend generate_ppt.py의 _format_change와 동일. */
function formatChange(startText: string, endText: string): string {
  const [sv, unit] = parseValue(startText);
  const [ev] = parseValue(endText);
  if (sv === null || ev === null) return "-";
  const diff = Math.round((ev - sv) * 100) / 100;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
  return `${sign}${diff}${unit}`;
}

function addBodyCompSlide(pres: pptxgen, rows: BodyCompRowIn[]): void {
  const slide = pres.addSlide();
  slide.addText("체성분 검사 변화", { x: 0.3, y: 0.2, w: 8, h: 0.6, fontSize: 24, bold: true, color: DARK });

  const cols = ["항목", "시작", "중간", "마지막", "변화량", "목표치(적정치)"];
  const tableRows: pptxgen.TableRow[] = [
    cols.map((c) => ({ text: c, options: { fill: { color: HEADER_FILL }, bold: true, fontSize: 13, color: DARK } })),
  ];

  for (const row of rows) {
    const changeV = formatChange(row.start, row.end);
    const values = [row.label, row.start ?? "", row.mid ?? "", row.end ?? "", changeV, row.target ?? ""];
    tableRows.push(
      values.map((val, c) => ({
        text: String(val ?? ""),
        options: {
          fontSize: 12.5,
          color: row.highlight ? RED : DARK,
          bold: c === 4,
          ...(c === 5 ? { fill: { color: TARGET_FILL } } : {}),
        },
      })),
    );
  }

  slide.addTable(tableRows, {
    x: 0.5, y: 1.0, w: SLIDE_W - 1.0,
    rowH: 0.42,
    border: { type: "solid", color: LINE, pt: 0.5 },
  });
}

export interface GenerateProgress {
  progress: number;
  message: string;
}

/** pptxgenjs의 알려진 버그(gitbrent/PptxGenJS 다수 이슈) 우회: 여러 슬라이드가 있는 덱을
 * 만들면 실제로는 생성하지도 않은 slideMasterN.xml/notesMasterN.xml을
 * [Content_Types].xml에 Override로 잘못 등록해버린다. PowerPoint는 Content_Types가 가리키는
 * 파트가 실제로 있는지 엄격히 검사해 "복구" 팝업을 띄우며 열지 못하는 반면, python-pptx 같은
 * 관대한 파서는 관계 그래프만 따라가서 이 phantom 참조를 아예 안 보기 때문에 문제없이 열려
 * (검증 과정에서) 못 잡아낼 뻔했다. 생성된 zip을 열어 실제로 존재하지 않는 파트를 가리키는
 * Override 항목만 제거한다. */
async function sanitizePptxBlob(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const existingParts = new Set(Object.keys(zip.files).filter((name) => !zip.files[name].dir));

  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!contentTypesFile) return blob;
  const contentTypesXml = await contentTypesFile.async("string");

  const cleaned = contentTypesXml.replace(/<Override PartName="([^"]+)"[^>]*\/>/g, (whole, partName: string) =>
    existingParts.has(partName.replace(/^\//, "")) ? whole : "",
  );

  if (cleaned === contentTypesXml) return blob;

  zip.file("[Content_Types].xml", cleaned);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

/** SessionState 상당의 데이터를 받아 실제 .pptx Blob을 만든다 (backend run_generate_job의
 * 클라이언트 버전). 실제 픽셀 크롭(exportCroppedImage)은 여기서만 수행된다 - 비파괴 원칙의
 * 유일한 실행 지점. */
export async function generatePresentation(
  mode: Mode,
  photos: StoredPhoto[],
  sessionDates: Record<string, string>,
  bodyCompRows: BodyCompRowIn[],
  onProgress?: (p: GenerateProgress) => void,
): Promise<Blob> {
  onProgress?.({ progress: 0.05, message: "사진 정리 중" });

  const grouped = new Map<string, Map<number, StoredPhoto>>();
  for (const p of photos) {
    if (p.compos_id <= 0) continue;
    if (!grouped.has(p.session_type)) grouped.set(p.session_type, new Map());
    grouped.get(p.session_type)!.set(p.compos_id, p);
  }

  const allRecords = photos.filter((p) => p.compos_id > 0);
  const total = allRecords.length || 1;

  onProgress?.({ progress: 0.1, message: "사진 크롭 처리 중" });
  const croppedByPhotoId = new Map<string, CroppedImage>();
  for (let i = 0; i < allRecords.length; i++) {
    const record = allRecords[i];
    const img = await loadImageFromBlob(record.blob);
    croppedByPhotoId.set(
      record.photo_id,
      exportCroppedImage(img, record.rotation_deg, record.crop_box, record.compos_id),
    );
    onProgress?.({ progress: 0.1 + 0.6 * ((i + 1) / total), message: "사진 크롭 처리 중" });
  }

  const pairing = getSetPairing(mode);

  function formatCaptionDate(iso: string | undefined): string {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return formatCaptionDate(undefined);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  onProgress?.({ progress: 0.85, message: "PPT 렌더링 중" });

  // LAYOUT_WIDE(내장 프리셋)가 정확히 13.333x7.5in(SLIDE_W/SLIDE_H)와 같다 - defineLayout()으로
  // 커스텀 레이아웃을 만들면 pptxgenjs가 존재하지도 않는 slideMaster2.xml을
  // [Content_Types].xml에 잘못 등록해버려(실사용 중 발견 - PowerPoint에서 "복구" 팝업이 뜨고
  // 열리지 않았음, python-pptx는 그 참조를 안 따라가서 문제없이 열려 못 잡아냈던 버그) 내장
  // 프리셋을 쓴다.
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";

  // 슬라이드 순서: 구도1(세트1) -> 구도1(세트2) -> 구도2(세트1) -> ...
  let firstSlideDone = false;
  for (const [num, label] of COMPOS) {
    const wide = WIDE_COMPOS.has(num);
    for (const [beforeType, afterType] of pairing) {
      const beforeRec = grouped.get(beforeType)?.get(num);
      const afterRec = grouped.get(afterType)?.get(num);
      if (!beforeRec || !afterRec) continue;

      const before = croppedByPhotoId.get(beforeRec.photo_id);
      const after = croppedByPhotoId.get(afterRec.photo_id);
      if (!before || !after) continue;

      const showDates = !firstSlideDone;
      addPhotoSlide(
        pres, num, label, before, after,
        formatCaptionDate(sessionDates[beforeType]), formatCaptionDate(sessionDates[afterType]),
        showDates, wide,
      );
      firstSlideDone = true;
    }
  }

  addBodyCompSlide(pres, bodyCompRows);

  onProgress?.({ progress: 0.95, message: "파일 저장 중" });
  const rawBlob = (await pres.write({ outputType: "blob" })) as Blob;
  const blob = await sanitizePptxBlob(rawBlob);
  onProgress?.({ progress: 1.0, message: "완료" });
  return blob;
}
