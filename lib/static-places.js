// 배포 환경에서 네이버 비공식 북마크 API를 호출하지 않고,
// 배포에 포함된 places.json의 장소만 사용합니다.
// places.json 변경 사항은 재배포 후 반영됩니다.
const { places = [], naverListUrl = "" } = require("../places.json");

async function getPlaceData() {
  return {
    places,
    source: "snapshot",
    naverListUrl,
    ...(!places.length
      ? { warning: "places.json에 등록된 장소가 없습니다. 로컬에서 update-places.js를 실행해 주세요." }
      : {}),
  };
}

module.exports = { getPlaceData };
