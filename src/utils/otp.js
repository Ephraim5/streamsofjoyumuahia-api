const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function generateOtp() {
  // 6-digit numeric code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = await bcrypt.hash(code, 10);
  return { code, hash };
}

async function verifyOtp(code, hash) {
  return await bcrypt.compare(code, hash);
}

module.exports = { generateOtp, verifyOtp };
