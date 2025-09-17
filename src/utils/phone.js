function normalizeNigeriaPhone(raw, withPlusChar) {
  if (!raw) return null;
  
  // 1. Remove non-digit characters
  const s = raw.replace(/\D/g, '');
  
  // 2. Handle Nigerian phone numbers (080..., 23480..., +23480...)
  if (s.startsWith('0') && s.length === 11) {
    const normalized = '234' + s.slice(1);
    return withPlusChar ? `+${normalized}` : normalized;
  }
  
  // 3. Handle numbers already in international format
  if (s.startsWith('234') && s.length === 13) {
    return withPlusChar ? `+${s}` : s;
  }
  
  // 4. Handle numbers without leading zero or country code
  if (s.length === 10) {
    const normalized = '234' + s;
    return withPlusChar ? `+${normalized}` : normalized;
  }
  
  // 5. If none of the above, return null or the original value
  return null;
}

module.exports = { normalizeNigeriaPhone };