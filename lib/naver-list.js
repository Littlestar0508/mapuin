// 비공식 네이버 저장 리스트 조회 엔드포인트를 선택적으로 사용합니다.
// 서비스 변경/인증 요구에 대비해 places.json 로컬 복사본을 fallback으로 사용합니다.
const crypto = require("node:crypto");
const settings = require("../places.json");
const {
  naverListUrl = "",
  naverShareId = "",
  places: savedPlaces = [],
} = settings;

const validCoord = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;
const number = (value) =>
  value === null || value === undefined || value === "" ? NaN : Number(value);
const isObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);

function findBookmarks(source) {
  if (Array.isArray(source)) return source;
  const queue = [{ value: source, level: 0 }];
  const seen = new Set();
  while (queue.length) {
    const { value, level } = queue.shift();
    if (!isObject(value) || seen.has(value) || level > 5) continue;
    seen.add(value);
    for (const key of ["bookmarkList", "bookmarks", "items", "places"]) {
      if (Array.isArray(value[key])) return value[key];
    }
    for (const child of Object.values(value))
      if (isObject(child)) queue.push({ value: child, level: level + 1 });
  }
  throw new Error("응답에서 bookmarks 배열을 찾을 수 없습니다.");
}

function normalizeBookmarks(raw) {
  const bookmarks = findBookmarks(raw);
  const seen = new Set();
  const output = [];
  for (const item of bookmarks) {
    if (!isObject(item)) continue;
    const p = isObject(item.place)
      ? item.place
      : isObject(item.placeInfo)
        ? item.placeInfo
        : item;
    const name = [
      item.displayname,
      item.displayName,
      item.name,
      item.placeName,
      p.displayname,
      p.displayName,
      p.name,
      p.placeName,
    ].find((s) => typeof s === "string" && s.trim());
    let lat = number(
      p.lat ??
        p.latitude ??
        p.py ??
        p.y ??
        item.lat ??
        item.latitude ??
        item.py ??
        item.y,
    );
    let lng = number(
      p.lng ??
        p.lon ??
        p.longitude ??
        p.px ??
        p.x ??
        item.lng ??
        item.lon ??
        item.longitude ??
        item.px ??
        item.x,
    );
    // 좌표가 반대로 저장된 데이터라면 보정 (국내 장소의 위도/경도 범위)
    if (lat > 120 && lng > 30 && lng < 45) [lat, lng] = [lng, lat];
    if (!name || !validCoord(lat, lng)) continue;
    const rawId = item.bookmarkId ?? item.id ?? item.sid ?? p.id ?? p.sid;
    const stable = rawId
      ? String(rawId)
      : crypto
          .createHash("sha256")
          .update(`${name}|${lat}|${lng}`)
          .digest("hex")
          .slice(0, 18);
    let id = `naver-${stable}`;
    if (seen.has(id)) continue;
    seen.add(id);
    output.push({ id, name: name.trim(), lat, lng });
    if (output.length >= 1000) break;
  }
  return output;
}

let cache = null;
let cacheUntil = 0;
async function fetchNaverPlaces() {
  if (!/^[a-f0-9]{32}$/i.test(naverShareId))
    throw new Error("공유 리스트 ID 형식이 올바르지 않습니다.");
  if (cache && Date.now() < cacheUntil) return cache;
  const url = `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${naverShareId}/bookmarks?start=0&limit=1000&sort=lastUseTime`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; PersonalMap/1.0)",
    },
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error(`저장 리스트 조회 HTTP ${response.status}`);
  if (
    !(response.headers.get("content-type") || "").toLowerCase().includes("json")
  ) {
    throw new Error("네이버가 JSON 대신 다른 응답을 반환했습니다.");
  }
  const result = normalizeBookmarks(await response.json());
  if (!result.length)
    throw new Error(
      "저장 리스트에서 좌표가 포함된 장소를 확인하지 못했습니다.",
    );
  cache = result;
  cacheUntil = Date.now() + 60_000;
  return result;
}

async function getPlaceData() {
  try {
    return { places: await fetchNaverPlaces(), source: "naver", naverListUrl };
  } catch (error) {
    // 인증 쿠키와 네이버 계정 정보는 수집하거나 우회하지 않습니다.
    if (savedPlaces.length) {
      return {
        places: savedPlaces,
        source: "snapshot",
        naverListUrl,
        warning:
          "실시간 리스트 조회가 불가능하여 places.json에 저장된 장소를 표시합니다.",
      };
    }
    return {
      places: [],
      source: "unavailable",
      naverListUrl,
      warning: `공유 리스트 장소를 자동 조회하지 못했습니다 (${error.message}). JSON 가져오기 방법으로 places.json을 만들어 주세요.`,
    };
  }
}

module.exports = { normalizeBookmarks, getPlaceData };
