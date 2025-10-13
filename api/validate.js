const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { initData } = req.body;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update('8379546363:AAGPvEX6OMHh-8cVA-lSGOJDSgcy2xrmDv8')
      .digest();

    const computedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const valid = computedHash === hash;
    res.json({ valid });
  } else {
    res.status(405).send('Method Not Allowed');
  }
};