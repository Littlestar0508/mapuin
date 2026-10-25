const startNameElement = document.querySelector("#start-name");
const goalNameElement = document.querySelector("#goal-name");
const distanceElement = document.querySelector("#distance");
const durationElement = document.querySelector("#duration");
const statusElement = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const listElement = document.querySelector("#place-list");
const naverListLink = document.querySelector("#naver-list-link");

// ============================================
// 1. 지도 설정
// ============================================

// 네이버 Map Style Editor에서 발급받은 My Style ID
const CUSTOM_STYLE_ID = "caf56c7f-8cca-4323-a4f8-07f3df2b8443";

// true: 모든 핀이 보이도록 지도 자동 이동
// false: 초기 지도 위치 유지
const AUTO_FIT_PINS = false;

// 초기 위치 및 확대 수준
// 대한민국 중부: 장소가 있더라도 첫 번째 핀으로 시작 위치를 바꾸지 않습니다.
const INITIAL_CENTER = {
  lat: 36.1,
  lng: 127.8,
};

const INITIAL_ZOOM = 5;

// 제주도와 동쪽 도서를 포함한 남한 일대의 초기 지도 범위
const INITIAL_KOREA_BOUNDS = {
  south: 33.0,
  west: 124.5,
  north: 38.7,
  east: 131.9,
};

// ============================================
// 2. 전역 상태
// ============================================

let places = [];
let map = null;
let routeLine = null;

let startId = null;
let goalId = null;

let requestVersion = 0;
let sdkAuthFailed = false;

const markerElements = new Map();

// ============================================
// 3. 상태 메시지
// ============================================

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

// ============================================
// 4. 마커 상태 관리
// ============================================

function updateMarkerStates() {
  for (const [id, element] of markerElements) {
    element.classList.toggle("is-start", id === startId);
    element.classList.toggle("is-goal", id === goalId);
  }
}

function updatePlaceButtons() {
  listElement.querySelectorAll("button[data-place-id]").forEach((button) => {
    button.classList.toggle("start", button.dataset.placeId === startId);

    button.classList.toggle("goal", button.dataset.placeId === goalId);
  });
}

// ============================================
// 5. 이름이 표시되는 마커 생성
// ============================================

function createLabeledMarker(place, position) {
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
      anchor: new naver.maps.Point(110, 11),
    },
  });
}

// ============================================
// 6. 선택 초기화
// ============================================

function resetSelection() {
  requestVersion += 1;

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

// ============================================
// 7. 핀 선택 및 차량 거리 계산
// ============================================

async function selectPlace(placeId) {
  const place = places.find((p) => p.id === placeId);

  if (!place) return;

  if (startId === null || goalId !== null) {
    resetSelection();
  }

  // 출발지 선택
  if (startId === null) {
    startId = placeId;

    startNameElement.textContent = place.name;

    updatePlaceButtons();
    updateMarkerStates();

    setStatus("도착지 핀을 선택하세요.");
    return;
  }

  // 같은 장소 선택 방지
  if (placeId === startId) {
    setStatus("출발지와 다른 핀을 선택하세요.");
    return;
  }

  // 도착지 선택
  goalId = placeId;

  goalNameElement.textContent = place.name;

  updatePlaceButtons();
  updateMarkerStates();

  setStatus("차량 경로를 계산하고 있습니다...");

  const version = ++requestVersion;

  try {
    const response = await fetch("/api/directions", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        startId,
        goalId,
      }),
    });

    const data = await response.json();

    if (version !== requestVersion) return;

    if (!response.ok) {
      throw new Error(data.error || "경로 조회에 실패했습니다.");
    }

    // 이동거리 표시
    distanceElement.textContent = `거리: ${(data.distanceMeters / 1000).toFixed(1)} km`;

    // 예상 소요시간 표시
    durationElement.textContent = `예상 시간: 약 ${Math.round(data.durationMs / 60000)}분`;

    setStatus(
      "차량 경로를 표시했습니다. 다른 핀을 선택하면 새로운 경로를 조회합니다.",
    );

    // 기존 경로 삭제
    if (routeLine) {
      routeLine.setMap(null);
      routeLine = null;
    }

    // 새로운 경로 표시
    if (Array.isArray(data.path) && data.path.length > 1) {
      const path = data.path.map(
        ([lng, lat]) => new naver.maps.LatLng(lat, lng),
      );

      routeLine = new naver.maps.Polyline({
        map,
        path,

        strokeColor: "#FF2D8D",
        strokeWeight: 10,
        strokeOpacity: 1,
      });

      // 설정에 따라 경로 전체가 보이도록 이동
      if (AUTO_FIT_PINS) {
        const bounds = new naver.maps.LatLngBounds();

        path.forEach((point) => {
          bounds.extend(point);
        });

        map.fitBounds(bounds, {
          top: 90,
          right: 130,
          bottom: 100,
          left: 130,
        });
      }
    }
  } catch (error) {
    if (version !== requestVersion) return;

    distanceElement.textContent = "거리: -";
    durationElement.textContent = "예상 시간: -";

    setStatus(error.message || "경로 조회 중 문제가 발생했습니다.", true);

    console.error("[경로 조회 오류]", error);
  }
}

// ============================================
// 8. 장소 목록 출력
// ============================================

function renderPlaces() {
  listElement.replaceChildren();

  places.forEach((place) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "place-button";

    button.dataset.placeId = place.id;
    button.textContent = place.name;

    button.addEventListener("click", () => {
      selectPlace(place.id);
    });

    listElement.append(button);
  });
}

// ============================================
// 9. 네이버 지도 생성
// ============================================

function renderMap() {
  if (!window.naver?.maps) {
    throw new Error("네이버 지도 SDK를 사용할 수 없습니다.");
  }

  const first = INITIAL_CENTER;

  const mapOptions = {
    center: new naver.maps.LatLng(first.lat, first.lng),

    zoom: INITIAL_ZOOM,

    scaleControl: false,
    mapTypeControl: false,
    zoomControl: false,

    mapDataControl: true,
  };

  // 커스텀 스타일 설정
  if (CUSTOM_STYLE_ID) {
    mapOptions.gl = true;
    mapOptions.customStyleId = CUSTOM_STYLE_ID;
  }

  console.info("[지도 진단] 지도 생성 옵션:", {
    gl: mapOptions.gl ?? false,
    customStyleId: mapOptions.customStyleId ?? null,
    zoom: mapOptions.zoom,
  });

  map = new naver.maps.Map("map", mapOptions);

  // 최초 렌더링 시 남한 전체를 화면 크기에 맞춰 표시합니다.
  // 지도 SDK가 정상 로딩된 이후 renderMap()에서 실행됩니다.
  if (!AUTO_FIT_PINS) {
    map.fitBounds(
      new naver.maps.LatLngBounds(
        new naver.maps.LatLng(INITIAL_KOREA_BOUNDS.south, INITIAL_KOREA_BOUNDS.west),
        new naver.maps.LatLng(INITIAL_KOREA_BOUNDS.north, INITIAL_KOREA_BOUNDS.east),
      ),
      { top: 20, right: 20, bottom: 20, left: 20 },
    );
  }

  console.info("[지도 진단] 지도 객체 생성 완료:", Boolean(map));

  // 기존 마커 상태 초기화
  markerElements.clear();

  const bounds = new naver.maps.LatLngBounds();

  // 모든 장소에 핀 생성
  places.forEach((place) => {
    const position = new naver.maps.LatLng(place.lat, place.lng);

    bounds.extend(position);

    const marker = createLabeledMarker(place, position);

    naver.maps.Event.addListener(marker, "click", () => selectPlace(place.id));
  });

  // 필요할 때만 전체 핀이 보이도록 이동
  if (AUTO_FIT_PINS && places.length > 1) {
    map.fitBounds(bounds, {
      top: 90,
      right: 130,
      bottom: 100,
      left: 130,
    });
  }

  resetSelection();
}

// ============================================
// 10. 네이버 지도 인증 오류 처리
// ============================================

window.navermap_authFailure = function () {
  sdkAuthFailed = true;

  setStatus(
    "네이버 지도 인증 오류: Client ID, API 사용 설정, Web 서비스 URL을 확인하세요.",
    true,
  );

  console.error("[지도 진단] 네이버 지도 인증 실패");
};

// ============================================
// 11. 네이버 지도 SDK 로딩
// ============================================

function loadMapSdk(clientId) {
  return new Promise((resolve, reject) => {
    const callbackName = "__naverMapSdkReady";

    let completed = false;
    let timeoutId = null;

    sdkAuthFailed = false;

    // 중복 완료 방지 및 정리
    function finish(error = null) {
      if (completed) return;

      completed = true;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      delete window[callbackName];

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    // SDK와 서브모듈 로딩 완료 콜백
    window[callbackName] = function () {
      console.info("[지도 진단] SDK 전체 로딩 콜백 실행");

      if (sdkAuthFailed || !window.naver?.maps) {
        finish(new Error("네이버 지도 인증 또는 SDK 로딩에 실패했습니다."));
        return;
      }

      console.info("[지도 진단] 네이버 지도 SDK 준비 완료:", true);

      console.info("[지도 진단] GL 사용 요청:", Boolean(CUSTOM_STYLE_ID));

      console.info(
        "[지도 진단] 커스텀 스타일 ID:",
        CUSTOM_STYLE_ID || "기본 지도",
      );

      finish();
    };

    // SDK 주소 생성
    const query = new URLSearchParams({
      ncpKeyId: clientId,
      callback: callbackName,
    });

    // 스타일 ID가 있다면 GL 서브모듈 로딩
    if (CUSTOM_STYLE_ID) {
      query.set("submodules", "gl");
    }

    const script = document.createElement("script");

    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?${query.toString()}`;

    script.async = true;

    // 스크립트 파일 로드와 전체 모듈 준비는 별개
    script.onload = function () {
      console.info("[지도 진단] maps.js 파일 로드 완료");
    };

    script.onerror = function () {
      finish(new Error("네이버 지도 SDK를 불러오지 못했습니다."));
    };

    // 무한 대기 방지
    timeoutId = setTimeout(() => {
      finish(new Error("네이버 지도 SDK 로딩 시간이 초과되었습니다."));
    }, 20000);

    document.head.append(script);
  });
}

// ============================================
// 12. 서버 JSON 데이터 조회
// ============================================

async function readJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`${url} 응답이 JSON 형식이 아닙니다.`);
  }

  if (!response.ok) {
    throw new Error(data.error || `${url}을(를) 불러올 수 없습니다.`);
  }

  return data;
}

// ============================================
// 13. 전체 초기화
// ============================================

async function initialize() {
  try {
    // 네이버 인증 정보 및 장소 목록 로딩
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

    // 장소 데이터 검증
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
        throw new Error("장소 목록의 id, name, lat, lng 값을 확인하세요.");
      }

      ids.add(p.id);

      return p;
    });

    console.info("[지도 진단] 장소 데이터 로딩 완료:", places.length);

    // 네이버 저장 리스트 링크 설정
    if (content.naverListUrl) {
      const url = new URL(content.naverListUrl);

      if (url.protocol === "https:") {
        naverListLink.href = url.href;
        naverListLink.hidden = false;
      }
    }

    // 장소 목록 렌더링
    renderPlaces();

    setStatus("네이버 지도 SDK를 불러오는 중입니다...");

    // 지도 SDK 로드 완료까지 대기
    await loadMapSdk(config.clientId);

    // SDK가 준비된 후 지도 생성
    renderMap();

    // 장소 상태 메시지
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

    console.error("[지도 진단] 네이버 지도 초기화 오류:", error);
  }
}

// ============================================
// 14. 이벤트 등록 및 실행
// ============================================

resetButton.addEventListener("click", resetSelection);

initialize();
