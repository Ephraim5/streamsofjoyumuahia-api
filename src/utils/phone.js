function normalizeNigeriaPhone(raw) {
  if (!raw) return raw;
  // remove spaces, dashes, parentheses
  let s = ('' + raw).replace(/[^0-9\+]/g, '');
  if (s.startsWith('+')) {
    // ensure +234...
    if (s.startsWith('+234')) return s;
  }
  if (s.startsWith('234')) {
    return '+' + s;
  }
  if (s.length === 11 && s.startsWith('0')) {
    return '+234' + s.slice(1);
  }
  // if already 10-digit (no leading zero) try add +234
  if (s.length === 10) {
    return '+234' + s;
  }
  return s;
}

module.exports = { normalizeNigeriaPhone };
