// 네이버 지도 로그인 상태에서 본인이 직접 받은 JSON 파일을 places.json으로 변환.
// 사용: node tools/import-bookmarks.js naver-bookmarks.json
const fs = require('node:fs');
const path = require('node:path');
const { normalizeBookmarks } = require('../lib/naver-list');
const filename = process.argv[2];
if (!filename) {
  console.error('사용법: node tools/import-bookmarks.js naver-bookmarks.json');
  process.exit(1);
}
try {
  const raw = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
  const places = normalizeBookmarks(raw);
  if (!places.length) throw new Error('좌표가 포함된 장소를 찾지 못했습니다. JSON 구조와 px/py 값을 확인하세요.');
  const config = require('../places.json');
  const dest = path.join(__dirname, '..', 'places.json');
  fs.writeFileSync(dest, JSON.stringify({ naverListUrl: config.naverListUrl, naverShareId: config.naverShareId, places }, null, 2) + '\n');
  console.log(`완료: places.json에 ${places.length}개의 핀을 저장했습니다. 웹페이지를 새로고침하세요.`);
} catch (e) {
  console.error('가져오기 실패:', e.message);
  process.exitCode = 1;
}
