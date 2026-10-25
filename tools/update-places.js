// 로컬에서 네이버 공유 저장 리스트를 읽고 places.json으로 저장합니다.
// 사용: node tools/update-places.js
// 주의: 비공식 API는 변경/제한될 수 있습니다. 실패 시 기존 JSON은 보존됩니다.
const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeBookmarks } = require("../lib/naver-list");

const filePath = path.resolve(__dirname, "../places.json");

async function main() {
  const current = JSON.parse(await fs.readFile(filePath, "utf8"));
  const shareId = current.naverShareId;

  if (!/^[a-f0-9]{32}$/i.test(shareId || "")) {
    throw new Error("places.json의 naverShareId를 확인해 주세요.");
  }

  const url =
    `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/` +
    `${shareId}/bookmarks?start=0&limit=1000&sort=lastUseTime`;

  console.log("네이버 저장 리스트에서 장소를 가져오는 중...");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; PersonalMap/1.0)",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`네이버 응답 HTTP ${response.status}`);
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("json")) {
    throw new Error("네이버가 JSON 형식의 응답을 반환하지 않았습니다.");
  }

  const raw = await response.json();
  const places = normalizeBookmarks(raw);
  if (!places.length) {
    throw new Error("유효한 장소가 0개입니다. 기존 places.json은 그대로 유지합니다.");
  }

  // 전부 검증된 다음에만 파일을 덮어씁니다.
  const updated = { ...current, places };
  const json = JSON.stringify(updated, null, 2) + "\n";
  const tmpPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(tmpPath, json, "utf8");
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  console.log(`완료: ${places.length}개 장소를 places.json에 저장했습니다.`);
  console.log("로컬 확인 후 vercel --prod로 반영하세요.");
}

main().catch((error) => {
  console.error("장소 갱신 실패:", error.message);
  console.error("기존 places.json은 유지됩니다.");
  process.exitCode = 1;
});
