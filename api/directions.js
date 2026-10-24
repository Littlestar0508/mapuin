// POST /api/directions: 등록된 장소 ID 2개만 허용하는 Vercel Node.js 함수
const { places } = require('../places.json');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 허용합니다.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'JSON 요청 형식을 확인하세요.' });
  }

  const { startId, goalId } = body || {};
  if (typeof startId !== 'string' || typeof goalId !== 'string' || startId === goalId) {
    return res.status(400).json({ error: '서로 다른 두 장소를 선택하세요.' });
  }

  // 등록된 장소만 이용하도록 하여 외부 사용자의 임의 API 호출을 줄입니다.
  const start = places.find((p) => p.id === startId);
  const goal = places.find((p) => p.id === goalId);
  if (!start || !goal) {
    return res.status(400).json({ error: '등록되지 않은 장소입니다.' });
  }

  const clientId = process.env.NAVER_MAPS_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: '서버의 네이버 지도 인증 환경 변수가 설정되지 않았습니다.' });
  }

  const url = new URL('https://maps.apigw.ntruss.com/map-direction/v1/driving');
  url.searchParams.set('start', `${start.lng},${start.lat}`);
  url.searchParams.set('goal', `${goal.lng},${goal.lat}`);
  url.searchParams.set('option', 'traoptimal');

  try {
    const upstream = await fetch(url, {
      headers: {
        'x-ncp-apigw-api-key-id': clientId,
        'x-ncp-apigw-api-key': clientSecret
      },
      signal: AbortSignal.timeout(12000)
    });

    const payload = await upstream.json();
    const route = payload.route?.traoptimal?.[0];
    if (!upstream.ok || Number(payload.code) !== 0 || !route?.summary || !Array.isArray(route.path)) {
      // 비밀키나 원본 오류 본문을 클라이언트에 넘기지 않습니다.
      console.error('Directions 응답 오류', { status: upstream.status, code: payload.code, message: payload.message });
      return res.status(502).json({
        error: '차량 경로를 조회할 수 없습니다. Directions 5 활성화와 장소 좌표를 확인하세요.'
      });
    }

    return res.status(200).json({
      distanceMeters: route.summary.distance,
      durationMs: route.summary.duration,
      path: route.path // 네이버 API는 [경도, 위도] 순서
    });
  } catch (error) {
    console.error('Directions 요청 실패:', error?.message || error);
    return res.status(502).json({ error: '네이버 경로 API 연결에 실패했습니다.' });
  }
};
