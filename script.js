const startNameElement = document.querySelector("#start-name");
const goalNameElement = document.querySelector("#goal-name");
const distanceElement = document.querySelector("#distance");
const durationElement = document.querySelector("#duration");
const statusElement = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const listElement = document.querySelector("#place-list");
const naverListLink = document.querySelector("#naver-list-link");

let places = [];
let map = null;
let routeLine = null;
let startId = null;
let goalId = null;
let requestVersion = 0;
let sdkAuthFailed = false;
const markerElements = new Map();

// true: 단색 지도 (도로/상호명 없음) / false: 네이버 일반 지도
const USE_PLAIN_MAP = false;
const PLAIN_TILE_URL =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
      '<rect width="256" height="256" fill="#f3f6fa"/></svg>',
  );

function updateMarkerStates() {
  for (const [id, element] of markerElements) {
    element.classList.toggle("is-start", id === startId);
    element.classList.toggle("is-goal", id === goalId);
  }
}

function createLabeledMarker(place, position) {
  // HTML 문자열을 조립하지 않아 저장 리스트의 장소명도 안전하게 표시합니다.
  const content = document.createElement("div");
  content.className = "map-marker";
  const dot = document.createElement("span");
  dot.className = "map-marker__dot";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "map-marker__label";
  label.textContent = place.name;
  content.append(dot, label);
  markerElements.set(place.id, content);

  return new naver.maps.Marker({
    position,
    map,
    title: place.name,
    icon: {
      content,
      size: new naver.maps.Size(220, 80),
      // 핀의 원형 중심이 장소 좌표에 오고, 이름은 그 아래에 표시됩니다.
      anchor: new naver.maps.Point(110, 11),
    },
  });
}

function usePlainMapTiles() {
  if (!USE_PLAIN_MAP) return;
  // 네이버 지도 SDK의 공식 사용자 지도 유형 기능을 활용합니다.
  // 지도 로고 및 저작권 표기는 SDK가 그대로 표시합니다.
  if (!naver.maps.ImageMapType || !naver.maps.EPSG3857) {
    console.warn(
      "이 지도 SDK는 사용자 정의 지도 유형을 지원하지 않습니다. 기본 지도를 표시합니다.",
    );
    return;
  }
  try {
    const plainMap = new naver.maps.ImageMapType({
      name: "단색 지도",
      minZoom: 5,
      maxZoom: 21,
      tileSize: new naver.maps.Size(256, 256),
      projection: naver.maps.EPSG3857,
      repeatX: true,
      getTileUrl: () => PLAIN_TILE_URL,
    });
    map.mapTypes.set("PLAIN", plainMap);
    map.setMapTypeId("PLAIN");
  } catch (error) {
    console.warn(
      "단색 지도 적용에 실패해 네이버 기본 지도를 사용합니다.",
      error,
    );
  }
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function updatePlaceButtons() {
  listElement.querySelectorAll("button[data-place-id]").forEach((button) => {
    button.classList.toggle("start", button.dataset.placeId === startId);
    button.classList.toggle("goal", button.dataset.placeId === goalId);
  });
}

function resetSelection() {
  requestVersion += 1; // 이미 시작된 응답이 도착해도 무시합니다.
  startId = null;
  goalId = null;
  startNameElement.textContent = "미선택";
  goalNameElement.textContent = "미선택";
  distanceElement.textContent = "거리: -";
  durationElement.textContent = "예상 시간: -";
  if (routeLine) {
    routeLine.setMap(null);
    routeLine = null;
  }
  updatePlaceButtons();
  updateMarkerStates();
  setStatus("출발지 핀을 선택하세요.");
}

async function selectPlace(placeId) {
  const place = places.find((p) => p.id === placeId);
  if (!place) return;

  if (startId === null || goalId !== null) resetSelection();

  if (startId === null) {
    startId = placeId;
    startNameElement.textContent = place.name;
    updatePlaceButtons();
    updateMarkerStates();
    setStatus("도착지 핀을 선택하세요.");
    return;
  }
  if (placeId === startId) {
    setStatus("출발지와 다른 핀을 선택하세요.");
    return;
  }

  goalId = placeId;
  goalNameElement.textContent = place.name;
  updatePlaceButtons();
  updateMarkerStates();
  setStatus("차량 경로를 계산하고 있습니다...");
  const version = ++requestVersion;

  try {
    const response = await fetch("/api/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startId, goalId }),
    });
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok)
      throw new Error(data.error || "경로 조회에 실패했습니다.");

    distanceElement.textContent = `거리: ${(data.distanceMeters / 1000).toFixed(1)} km`;
    durationElement.textContent = `예상 시간: 약 ${Math.round(data.durationMs / 60000)}분`;
    setStatus(
      "차량 경로를 표시했습니다. 다른 핀을 선택하면 새로운 경로를 조회합니다.",
    );

    if (routeLine) routeLine.setMap(null);
    if (Array.isArray(data.path) && data.path.length > 1) {
      const path = data.path.map(
        ([lng, lat]) => new naver.maps.LatLng(lat, lng),
      );
      routeLine = new naver.maps.Polyline({
        map,
        path,
        strokeColor: "#1769dd",
        strokeWeight: 5,
        strokeOpacity: 0.85,
      });
      const bounds = new naver.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { top: 90, right: 130, bottom: 100, left: 130 });
    }
  } catch (error) {
    if (version !== requestVersion) return;
    distanceElement.textContent = "거리: -";
    durationElement.textContent = "예상 시간: -";
    setStatus(error.message || "경로 조회 중 문제가 발생했습니다.", true);
  }
}

function renderPlaces() {
  listElement.replaceChildren();
  places.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-button";
    button.dataset.placeId = place.id;
    button.textContent = place.name;
    button.addEventListener("click", () => selectPlace(place.id));
    listElement.append(button);
  });
}

function renderMap() {
  if (!window.naver?.maps)
    throw new Error("네이버 지도 SDK를 사용할 수 없습니다.");
  const first = places[0] || { lat: 37.56661, lng: 126.97839 };
  map = new naver.maps.Map("map", {
    center: new naver.maps.LatLng(first.lat, first.lng),
    zoom: 11,
    scaleControl: false,
    mapTypeControl: false,
    zoomControl: false,
    // 저작권/네이버 로고 표기는 SDK 기본값을 유지합니다.
    mapDataControl: true,
  });
  usePlainMapTiles();
  markerElements.clear();
  const bounds = new naver.maps.LatLngBounds();
  places.forEach((place) => {
    const position = new naver.maps.LatLng(place.lat, place.lng);
    bounds.extend(position);
    const marker = createLabeledMarker(place, position);
    naver.maps.Event.addListener(marker, "click", () => selectPlace(place.id));
  });
  // 긴 장소명이 지도 양끝에서 잘리지 않도록 여백을 확보합니다.
  if (places.length > 1) {
    map.fitBounds(bounds, { top: 90, right: 130, bottom: 100, left: 130 });
  }
  resetSelection();
}

// 인증 오류 콜백은 SDK를 불러오기 전에 정의해야 합니다.
window.navermap_authFailure = function () {
  sdkAuthFailed = true;
  setStatus(
    "네이버 지도 인증 오류: Client ID, Maps API 사용 설정, Web 서비스 URL을 확인하세요.",
    true,
  );
};

function loadMapSdk(clientId) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.async = true;
    script.onload = () => {
      if (sdkAuthFailed || !window.naver?.maps) {
        reject(
          new Error(
            "지도 인증에 실패했거나 지도 SDK가 정상적으로 로드되지 않았습니다.",
          ),
        );
      } else {
        resolve();
      }
    };
    script.onerror = () =>
      reject(
        new Error(
          "네이버 지도 SDK를 불러오지 못했습니다. 네트워크와 등록된 도메인을 확인하세요.",
        ),
      );
    document.head.append(script);
  });
}

async function readJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${url} 응답이 JSON 형식이 아닙니다.`);
  }
  if (!response.ok)
    throw new Error(data.error || `${url}을(를) 불러올 수 없습니다.`);
  return data;
}

async function initialize() {
  try {
    const [config, content] = await Promise.all([
      readJson("/api/config"),
      readJson("/api/places"),
    ]);
    if (!config.clientId || typeof config.clientId !== "string") {
      throw new Error("서버에서 유효한 Client ID를 받지 못했습니다.");
    }
    if (!Array.isArray(content.places)) {
      throw new Error("장소 조회 응답 형식을 확인해 주세요.");
    }
    const ids = new Set();
    places = content.places.map((p) => {
      if (
        !p ||
        typeof p.id !== "string" ||
        !p.id ||
        typeof p.name !== "string" ||
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lng) ||
        Math.abs(p.lat) > 90 ||
        Math.abs(p.lng) > 180 ||
        ids.has(p.id)
      ) {
        throw new Error(
          "장소 목록의 id(중복 없음), name, lat, lng 값을 확인하세요.",
        );
      }
      ids.add(p.id);
      return p;
    });

    if (content.naverListUrl) {
      const url = new URL(content.naverListUrl);
      if (url.protocol === "https:") {
        naverListLink.href = url.href;
        naverListLink.hidden = false;
      }
    }
    renderPlaces();
    setStatus("네이버 지도 SDK를 불러오는 중입니다...");
    await loadMapSdk(config.clientId);
    renderMap();
    if (!places.length) {
      setStatus(content.warning || "등록된 장소가 없습니다.", true);
    } else if (content.source === "naver") {
      setStatus(
        `네이버 저장 리스트에서 ${places.length}개 장소를 불러왔습니다. 출발지를 선택하세요.`,
      );
    } else {
      setStatus(
        `${places.length}개 장소를 로드했습니다. ${content.warning || "출발지를 선택하세요."}`,
      );
    }
  } catch (error) {
    setStatus(`초기화 실패: ${error.message || "알 수 없는 오류"}`, true);
    console.error("네이버 지도 초기화 오류:", error);
  }
}

resetButton.addEventListener("click", resetSelection);
initialize();
