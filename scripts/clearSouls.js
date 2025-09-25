// Delete all Souls from the database.
// Usage (Windows cmd):
//   node scripts/clearSouls.js
// Make sure .env has MONGODB_URI or MONGODB_LIVE_URI configured.

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const Soul = require('../src/models/Soul');

async function main() {
  try {
    await connectDB();
    const count = await Soul.countDocuments();
    if (count === 0) {
      console.log('[clearSouls] No Souls to delete.');
    } else {
      const res = await Soul.deleteMany({});
      console.log(`[clearSouls] Deleted ${res.deletedCount} Souls.`);
    }
  } catch (err) {
    console.error('[clearSouls] Error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
