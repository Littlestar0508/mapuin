const startNameElement = document.querySelector('#start-name');
const goalNameElement = document.querySelector('#goal-name');
const distanceElement = document.querySelector('#distance');
const durationElement = document.querySelector('#duration');
const statusElement = document.querySelector('#status');
const resetButton = document.querySelector('#reset');
const listElement = document.querySelector('#place-list');
const naverListLink = document.querySelector('#naver-list-link');

let places = [];
let map = null;
let routeLine = null;
let startId = null;
let goalId = null;
let requestVersion = 0;
let sdkAuthFailed = false;

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

function updatePlaceButtons() {
  listElement.querySelectorAll('button[data-place-id]').forEach((button) => {
    button.classList.toggle('start', button.dataset.placeId === startId);
    button.classList.toggle('goal', button.dataset.placeId === goalId);
  });
}

function resetSelection() {
  requestVersion += 1; // 이미 시작된 응답이 도착해도 무시합니다.
  startId = null;
  goalId = null;
  startNameElement.textContent = '미선택';
  goalNameElement.textContent = '미선택';
  distanceElement.textContent = '거리: -';
  durationElement.textContent = '예상 시간: -';
  if (routeLine) {
    routeLine.setMap(null);
    routeLine = null;
  }
  updatePlaceButtons();
  setStatus('출발지 핀을 선택하세요.');
}

async function selectPlace(placeId) {
  const place = places.find((p) => p.id === placeId);
  if (!place) return;

  if (startId === null || goalId !== null) resetSelection();

  if (startId === null) {
    startId = placeId;
    startNameElement.textContent = place.name;
    updatePlaceButtons();
    setStatus('도착지 핀을 선택하세요.');
    return;
  }
  if (placeId === startId) {
    setStatus('출발지와 다른 핀을 선택하세요.');
    return;
  }

  goalId = placeId;
  goalNameElement.textContent = place.name;
  updatePlaceButtons();
  setStatus('차량 경로를 계산하고 있습니다...');
  const version = ++requestVersion;

  try {
    const response = await fetch('/api/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startId, goalId })
    });
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(data.error || '경로 조회에 실패했습니다.');

    distanceElement.textContent = `거리: ${(data.distanceMeters / 1000).toFixed(1)} km`;
    durationElement.textContent = `예상 시간: 약 ${Math.round(data.durationMs / 60000)}분`;
    setStatus('차량 경로를 표시했습니다. 다른 핀을 선택하면 새로운 경로를 조회합니다.');

    if (routeLine) routeLine.setMap(null);
    if (Array.isArray(data.path) && data.path.length > 1) {
      const path = data.path.map(([lng, lat]) => new naver.maps.LatLng(lat, lng));
      routeLine = new naver.maps.Polyline({
        map, path, strokeColor: '#1769dd', strokeWeight: 5, strokeOpacity: 0.85
      });
      const bounds = new naver.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds);
    }
  } catch (error) {
    if (version !== requestVersion) return;
    distanceElement.textContent = '거리: -';
    durationElement.textContent = '예상 시간: -';
    setStatus(error.message || '경로 조회 중 문제가 발생했습니다.', true);
  }
}

function renderPlaces() {
  listElement.replaceChildren();
  places.forEach((place) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-button';
    button.dataset.placeId = place.id;
    button.textContent = place.name;
    button.addEventListener('click', () => selectPlace(place.id));
    listElement.append(button);
  });
}

function renderMap() {
  if (!window.naver?.maps) throw new Error('네이버 지도 SDK를 사용할 수 없습니다.');
  const first = places[0];
  map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(first.lat, first.lng), zoom: 11
  });
  const bounds = new naver.maps.LatLngBounds();
  places.forEach((place) => {
    const position = new naver.maps.LatLng(place.lat, place.lng);
    bounds.extend(position);
    const marker = new naver.maps.Marker({ position, map, title: place.name });
    naver.maps.Event.addListener(marker, 'click', () => selectPlace(place.id));
  });
  if (places.length > 1) map.fitBounds(bounds);
  resetSelection();
}

// 인증 오류 콜백은 SDK를 불러오기 전에 정의해야 합니다.
window.navermap_authFailure = function () {
  sdkAuthFailed = true;
  setStatus('네이버 지도 인증 오류: Client ID, Maps API 사용 설정, Web 서비스 URL을 확인하세요.', true);
};

function loadMapSdk(clientId) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.async = true;
    script.onload = () => {
      if (sdkAuthFailed || !window.naver?.maps) {
        reject(new Error('지도 인증에 실패했거나 지도 SDK가 정상적으로 로드되지 않았습니다.'));
      } else {
        resolve();
      }
    };
    script.onerror = () => reject(new Error('네이버 지도 SDK를 불러오지 못했습니다. 네트워크와 등록된 도메인을 확인하세요.'));
    document.head.append(script);
  });
}

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  let data;
  try { data = await response.json(); } catch { throw new Error(`${url} 응답이 JSON 형식이 아닙니다.`); }
  if (!response.ok) throw new Error(data.error || `${url}을(를) 불러올 수 없습니다.`);
  return data;
}

async function initialize() {
  try {
    const [config, content] = await Promise.all([
      readJson('/api/config'),
      readJson('/places.json')
    ]);
    if (!config.clientId || typeof config.clientId !== 'string') {
      throw new Error('서버에서 유효한 Client ID를 받지 못했습니다.');
    }
    if (!Array.isArray(content.places) || content.places.length === 0) {
      throw new Error('places.json에 장소를 한 개 이상 등록해 주세요.');
    }
    const ids = new Set();
    places = content.places.map((p) => {
      if (!p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' ||
          !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
          Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || ids.has(p.id)) {
        throw new Error('places.json의 id(중복 없음), name, lat, lng 값을 확인하세요.');
      }
      ids.add(p.id);
      return p;
    });

    if (content.naverListUrl) {
      const url = new URL(content.naverListUrl);
      if (url.protocol === 'https:') {
        naverListLink.href = url.href;
        naverListLink.hidden = false;
      }
    }
    renderPlaces();
    setStatus('네이버 지도 SDK를 불러오는 중입니다...');
    await loadMapSdk(config.clientId);
    renderMap();
  } catch (error) {
    setStatus(`초기화 실패: ${error.message || '알 수 없는 오류'}`, true);
    console.error('네이버 지도 초기화 오류:', error);
  }
}

resetButton.addEventListener('click', resetSelection);
initialize();
