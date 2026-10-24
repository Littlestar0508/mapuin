const crypto = require("node:crypto");
const settings = require("../places.json");

const {
  naverListUrl = "",
  naverShareId = "",
  places: savedPlaces = [],
} = settings;

// ============================================
// 1. 데이터 검증
// ============================================

const validCoord = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

const number = (value) =>
  value === null || value === undefined || value === "" ? NaN : Number(value);

const isObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);

// ============================================
// 2. 네이버 북마크 배열 탐색
// ============================================

function findBookmarks(source) {
  if (Array.isArray(source)) return source;

  const queue = [{ value: source, level: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, level } = queue.shift();

    if (!isObject(value) || seen.has(value) || level > 5) {
      continue;
    }

    seen.add(value);

    for (const key of ["bookmarkList", "bookmarks", "items", "places"]) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }

    for (const child of Object.values(value)) {
      if (isObject(child)) {
        queue.push({
          value: child,
          level: level + 1,
        });
      }
    }
  }

  throw new Error("응답에서 bookmarks 배열을 찾을 수 없습니다.");
}

// ============================================
// 3. 네이버 장소 데이터 변환
// ============================================

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

    // 좌표가 뒤바뀐 경우 보정
    if (lat > 120 && lng > 30 && lng < 45) {
      [lat, lng] = [lng, lat];
    }

    if (!name || !validCoord(lat, lng)) {
      continue;
    }

    const rawId = item.bookmarkId ?? item.id ?? item.sid ?? p.id ?? p.sid;

    const stable = rawId
      ? String(rawId)
      : crypto
          .createHash("sha256")
          .update(`${name}|${lat}|${lng}`)
          .digest("hex")
          .slice(0, 18);

    const id = `naver-${stable}`;

    if (seen.has(id)) continue;

    seen.add(id);

    output.push({
      id,
      name: name.trim(),
      lat,
      lng,
    });

    if (output.length >= 1000) break;
  }

  return output;
}

// ============================================
// 4. 캐시 설정
// ============================================

let cache = null;
let cacheUntil = 0;

// ============================================
// 5. 네이버 저장 리스트 조회
// ============================================

async function fetchNaverPlaces() {
  if (!/^[a-f0-9]{32}$/i.test(naverShareId)) {
    throw new Error("공유 리스트 ID 형식이 올바르지 않습니다.");
  }

  // 캐시 데이터가 있다면 재사용
  if (cache && Date.now() < cacheUntil) {
    console.log("[NAVER] 캐시 데이터 사용");

    return cache;
  }

  const url = `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${naverShareId}/bookmarks?start=0&limit=1000&sort=lastUseTime`;

  // ==========================================
  // 진단: 요청 시작
  // ==========================================

  const startTime = Date.now();
  const region = process.env.VERCEL_REGION || "local";

  console.log("[NAVER] 요청 시작", {
    region,
    timestamp: new Date().toISOString(),
  });

  let response;
  let stage = "HTTP 응답 대기";

  try {
    // ========================================
    // 네이버 API 요청
    // ========================================

    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; PersonalMap/1.0)",
      },

      signal: AbortSignal.timeout(6500),
    });

    // ========================================
    // 진단: HTTP 응답 확인
    // ========================================

    console.log("[NAVER] HTTP 응답 수신", {
      region,
      status: response.status,
      elapsedMs: Date.now() - startTime,
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok) {
      throw new Error(`저장 리스트 조회 HTTP ${response.status}`);
    }

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    if (!contentType.includes("json")) {
      throw new Error("네이버가 JSON 대신 다른 응답을 반환했습니다.");
    }

    // ========================================
    // JSON 응답 변환
    // ========================================

    stage = "JSON 데이터 처리";

    const raw = await response.json();
    const result = normalizeBookmarks(raw);

    if (!result.length) {
      throw new Error(
        "저장 리스트에서 좌표가 포함된 장소를 확인하지 못했습니다.",
      );
    }

    // ========================================
    // 진단: 조회 성공
    // ========================================

    console.log("[NAVER] 장소 조회 성공", {
      region,
      elapsedMs: Date.now() - startTime,
      placesCount: result.length,
    });

    // 60초 캐시
    cache = result;
    cacheUntil = Date.now() + 60_000;

    return result;
  } catch (error) {
    // ========================================
    // 진단: 오류 정보 기록
    // ========================================

    console.error("[NAVER] 요청 실패", {
      region,
      stage,
      elapsedMs: Date.now() - startTime,
      errorName: error.name,
      errorMessage: error.message,
      causeCode: error.cause?.code || null,
    });

    throw error;
  }
}

// ============================================
// 6. 최종 장소 데이터 반환
// ============================================

async function getPlaceData() {
  try {
    const naverPlaces = await fetchNaverPlaces();

    return {
      places: naverPlaces,
      source: "naver",
      naverListUrl,
    };
  } catch (error) {
    // 실시간 조회 실패 시 저장된 장소 사용
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

// ============================================
// 7. 모듈 내보내기
// ============================================

module.exports = {
  normalizeBookmarks,
  getPlaceData,
};
