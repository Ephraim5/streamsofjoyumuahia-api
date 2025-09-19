const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const localURI = process.env.MONGODB_URI;
const liveURI = process.env.MONGODB_LIVE_URI;
const forceLive = process.env.USE_LIVE_DB === 'true';

function mask(uri) {
  if (!uri) return '(none)';
  try {
    const u = new URL(uri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));
    return `${u.hostname}/${u.pathname.replace('/', '')}`;
  } catch (_) {
    return uri.slice(0, 25) + '...';
  }
}

async function attempt(uri) {
  if (!uri) throw new Error('No MongoDB URI provided');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000
  });
}

const connectDB = async () => {
  const primaryFirst = forceLive ? liveURI : localURI;
  const secondary = forceLive ? localURI : liveURI;
  const sequence = [primaryFirst, secondary].filter(Boolean);

  let lastErr;
  for (let i = 0; i < sequence.length; i++) {
    const uri = sequence[i];
    console.log(`[db] Attempting MongoDB connection (${i + 1}/${sequence.length}) -> ${mask(uri)}${i===0 && forceLive ? ' [forced live]' : ''}`);
    for (let retry = 0; retry < 3; retry++) {
      try {
        await attempt(uri);
        console.log(`[db] MongoDB connected -> ${mask(uri)} (attempt ${retry + 1})`);
        return;
      } catch (err) {
        lastErr = err;
        console.warn(`[db] Connect failed (${mask(uri)}) retry ${retry + 1}/3: ${err.message}`);
        await new Promise(r => setTimeout(r, 1500 * (retry + 1)));
      }
    }
    console.warn(`[db] Giving up on URI: ${mask(uri)}`);
  }
  console.error('[db] All MongoDB connection attempts failed.', lastErr?.message);
  process.exit(1);
};

module.exports = connectDB;
