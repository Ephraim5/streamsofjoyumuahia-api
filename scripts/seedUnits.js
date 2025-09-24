// Script to seed default ministry units if they do not already exist.
// Usage: node scripts/seedUnits.js (normally invoked automatically on server start)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Unit = require('../src/models/Unit');

const DEFAULT_UNITS = [
  'Bankers Unit',
  'Chabod',
  'Counselling unit',
  'Couples fellowship',
  'Grit & Grace',
  'Home architect',
  'Joshua Generation',
  'Jubilee airforce',
  'Jubilee pilot',
  'Kingdom care unit',
  'Meeters and Greeters',
  'Mighty arrows',
  'Pastoral care unit',
  'Pillars of grace',
  'Program logistic unit',
  'Project Philip',
  'Protocol',
  'Real men',
  'Recovery unit',
  'SOJ Academy',
  'Streams emporium',
  'Supernatural ante- natal',
  'Teen’s church',
  'Temple keepers',
  'Training and development',
  'Transport unit',
  'Watchtower',
  'Pastor Unit'
];

async function seedUnits() {
  try {
    await connectDB();
    const existing = await Unit.find({}, 'name').lean();
    const existingNames = new Set(existing.map(u => u.name.toLowerCase()));
    const toCreate = DEFAULT_UNITS.filter(n => !existingNames.has(n.toLowerCase()));
    if (toCreate.length === 0) {
      console.log('[seedUnits] All default units already present.');
      return { created: 0 };
    }
    await Unit.insertMany(toCreate.map(name => ({ name })));
    console.log(`[seedUnits] Created ${toCreate.length} default units.`);
    return { created: toCreate.length };
  } catch (err) {
    console.error('[seedUnits] Error seeding units:', err.message);
    return { error: err.message };
  } finally {
    if (require.main === module) {
      await mongoose.connection.close();
    }
  }
}

module.exports = { seedUnits, DEFAULT_UNITS };

if (require.main === module) {
  seedUnits().then(() => {
    console.log('[seedUnits] Done');
  });
}
