# 네이버 지도 핀 선택 + 차량 이동거리 (Vercel 배포용)

HTML/CSS/Vanilla JavaScript 프런트엔드와 Vercel Node.js Functions 2개로 구성됩니다.

## 0. 먼저 확인해야 할 사실
- NAVER Maps API는 지도 렌더링과 차량 경로 조회를 지원합니다.
- 네이버 지도 앱의 개인 **저장 리스트 장소를 공식 공개 API로 자동 동기화하는 방법은 확인되지 않습니다.**
- 이 프로젝트의 `places.json`은 직접 등록하는 장소 목록입니다. 네이버 지도 앱의 저장 리스트 URL을 `naverListUrl`에 넣으면 링크를 제공할 수 있지만 장소 자동 동기화는 되지 않습니다.

## 1. 파일 구성
- `index.html`: 단일 페이지
- `style.css`: 스타일
- `script.js`: 지도 SDK, 핀, 선택 로직
- `places.json`: 핀 데이터 및 저장 리스트 공유 링크
- `api/config.js`: 브라우저에 공개 가능한 Client ID만 제공
- `api/directions.js`: 서버에서 Client Secret으로 Directions 5 호출
- `.env.example`: 환경 변수 서식 (실제 인증키를 넣지 않음)
- `.gitignore`: 개인 인증키 파일이 커밋되지 않도록 설정

## 2. 네이버 클라우드에서 해야 할 일
1. https://console.ncloud.com 에 접속하고 Maps 상품 이용을 신청합니다.
2. Services > Application Services > Maps > Application에서 Application을 등록합니다.
3. API 선택에 **Dynamic Map**과 **Directions 5**를 포함합니다.
4. Web 서비스 URL에 `http://localhost`를 입력합니다. 포트(`:3000`)와 경로(`/index.html`)는 넣지 마세요.
5. 배포 후에는 실제 도메인도 추가합니다. 예: `https://my-map.vercel.app` (경로/포트 없이). 필요하다면 Preview 도메인도 등록합니다.
6. 인증 정보에서 Maps **Client ID**와 **Client Secret**을 확인합니다.
7. Maps 이용량 한도와 알림을 설정하여 사용량/과금 위험을 관리합니다.

> 신규 Maps와 기존 Maps 문서/콘솔이 함께 보일 수 있습니다. 새로 등록한 Application의 Client ID와 활성화된 API가 일치하는지 확인하세요.

## 3. 로컬 개발
1. Node.js 20 이상 설치.
2. 프로젝트 최상위 폴더에 `.env.local`을 만들고 아래 내용을 실제 키로 교체:

```env
NAVER_MAPS_CLIENT_ID=실제_Client_ID
NAVER_MAPS_CLIENT_SECRET=실제_Client_Secret
```

3. Vercel CLI 설치 및 계정 연결:

```bash
npm install -g vercel
vercel login
vercel link
vercel dev
```

4. CLI가 출력하는 로컬 주소로 접속합니다(일반적으로 `http://localhost:3000`).
5. `http://localhost:3000/api/config`에 접속했을 때 `clientId`만 표시되는지 확인합니다. **Client Secret이 표시되면 안 됩니다.**
6. `.env.local`에만 값을 넣었는데 CLI가 변수를 읽지 못한다면, Vercel 대시보드의 Development 환경 변수에도 설정 후 `vercel dev`를 다시 실행하세요.

`index.html` 파일을 더블클릭하거나 VS Code Live Server로만 실행하면 `/api/...` 함수가 동작하지 않습니다. `vercel dev`로 실행하세요.

## 4. 장소 바꾸기
`places.json`의 `places` 배열을 수정합니다:

```json
{
  "naverListUrl": "https://네이버지도-저장-리스트-공유-주소",
  "places": [
    { "id": "place-01", "name": "장소 이름", "lat": 37.56661, "lng": 126.97839 },
    { "id": "place-02", "name": "다른 장소", "lat": 37.49794, "lng": 127.02762 }
  ]
}
```

- 위도는 `lat`, 경도는 `lng`입니다.
- `id`는 서로 다르게 부여하세요.
- `naverListUrl`은 선택 사항이며, 비워두면 링크를 숨깁니다.
- 좌표는 실제 장소의 위치로 교체해야 합니다. 차량 접근이 불가능한 지점은 경로 조회가 실패할 수 있습니다.
- 수정 후 배포 시에는 새 배포에 적용됩니다.

## 5. Vercel 배포
1. 전체 폴더를 GitHub 리포지토리에 올립니다. 단, `.env.local`은 업로드하면 안 됩니다.
2. Vercel > Add New > Project > GitHub 저장소 Import.
3. Framework Preset을 `Other`로 지정합니다. Root Directory가 이 프로젝트 폴더인지 확인합니다.
4. Vercel > Project Settings > Environment Variables에 아래 키를 각각 등록합니다:
   - `NAVER_MAPS_CLIENT_ID`: 발급받은 Client ID
   - `NAVER_MAPS_CLIENT_SECRET`: 발급받은 Client Secret
5. Production 환경(필요하면 Preview, Development도)에 적용되도록 선택합니다.
6. Deploy 또는 Redeploy 합니다. **환경 변수 변경은 이전 배포에 소급 적용되지 않습니다.**
7. 배포 URL을 네이버 클라우드의 Web 서비스 URL에도 등록하고, 웹페이지 새로고침.

## 6. 자주 발생하는 오류
- **지도 회색 화면**: `YOUR_CLIENT_ID` 같은 임시값이 남아 있지 않은지 확인. 이 버전은 `/api/config`에서 ID를 가져옵니다. Client ID, Maps Dynamic Map 활성화, `Web 서비스 URL`을 확인하세요. 브라우저 개발자 도구 F12 > Console / Network에서 `maps.js` 실패 여부 확인.
- **초기화 실패 /api/config**: 로컬을 `vercel dev`로 실행했는지, `.env.local`이 있는지, 배포 환경 변수를 등록했는지 확인.
- **지도는 보이는데 거리 계산 실패**: Directions 5 활성화, Client Secret, API 호출 한도, 각 장소의 좌표 확인. Vercel 프로젝트 로그에서 함수 에러 확인.
- **404 /api/directions**: `api/directions.js`가 프로젝트 최상위의 `api` 폴더 아래 있는지 확인.
- **저장 리스트 핀이 안 나타남**: 자동 동기화 기능이 아닙니다. `places.json`에 해당 장소의 좌표를 등록하세요.

## 7. 운영 유의 사항
- 공개 웹사이트는 API 사용량이 늘어날 수 있습니다. 네이버 클라우드 콘솔에서 일/월 사용량 제한과 알림을 설정하세요.
- 서버는 `places.json`에 등록된 ID로만 경로 API를 호출하지만, 공개 서비스의 남용을 완벽하게 막지는 못합니다. 사용량이 늘어나는 서비스라면 추가적인 Rate Limit 등을 구성하세요.
