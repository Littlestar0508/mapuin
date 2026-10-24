// 브라우저에서 지도 SDK를 로드하기 위해 Client ID만 제공합니다.
// Client ID는 공개되는 값입니다. Client Secret은 이 API에서 반환하지 않습니다.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 허용합니다.' });
  }

  const clientId = process.env.NAVER_MAPS_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'NAVER_MAPS_CLIENT_ID 환경 변수가 없습니다.' });
  }

  return res.status(200).json({ clientId });
};
