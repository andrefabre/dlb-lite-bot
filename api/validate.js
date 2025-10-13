const crypto = require('crypto');

// Validate Telegram Web App initData server-side using bot token from env
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { initData } = req.body || {};
  if (!initData) {
    return res.status(400).json({ valid: false, error: 'initData missing' });
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('BOT_TOKEN not set in environment');
    return res.status(500).json({ valid: false, error: 'server misconfigured' });
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // secret_key = HMAC_SHA256(bot_token, 'WebAppData')
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const valid = computedHash === hash;
  res.json({ valid });
};