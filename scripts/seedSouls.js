// Seed a few Souls for testing after clearing the collection.
// Usage:
//   node scripts/seedSouls.js

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const Soul = require('../src/models/Soul');
const Unit = require('../src/models/Unit');
const User = require('../src/models/User');

async function seedSouls() {
  await connectDB();
  try {
    const unit = await Unit.findOne();
    const user = await User.findOne();

    const base = {
      unit: unit?._id || null,
      addedBy: user?._id || null,
      location: 'Umuahia',
      convertedThrough: 'Evangelism',
      dateWon: new Date()
    };

    const docs = [
      { name: 'John Doe', phone: '+2348012345678', gender: 'Male', ageRange: '21 - 30', ...base },
      { name: 'Jane Smith', phone: '+2348098765432', gender: 'Female', ageRange: '31 - 40', ...base },
      { name: 'Michael Obi', phone: '+2348033332222', gender: 'Male', ageRange: '18 - 20', ...base }
    ];

    const res = await Soul.insertMany(docs);
    console.log(`[seedSouls] Inserted ${res.length} Souls.`);
  } catch (err) {
    console.error('[seedSouls] Error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  seedSouls();
}

module.exports = { seedSouls };
