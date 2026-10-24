const { getPlaceData } = require('../lib/naver-list');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 허용합니다.' });
  }
  return res.status(200).json(await getPlaceData());
};
