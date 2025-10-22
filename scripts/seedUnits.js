// Script to seed default ministry units if they do not already exist.
// Usage: node scripts/seedUnits.js (normally invoked automatically on server start)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Unit = require('../src/models/Unit');
const Church = require('../src/models/Church');

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

const MAIN_CHURCH_SLUG = 'soj-umuahia';
const MAIN_MINISTRY_NAME = 'Main Church';

async function seedUnits() {
  try {
    await connectDB();
    const church = await Church.findOne({ slug: MAIN_CHURCH_SLUG }).lean();
    if (!church) {
      console.warn(`[seedUnits] Default church with slug "${MAIN_CHURCH_SLUG}" not found. Skipping unit seed.`);
      return { created: 0, warning: 'default church missing' };
    }

    const churchId = church._id;

    if (!Array.isArray(church.ministries) || !church.ministries.some((m) => m?.name === MAIN_MINISTRY_NAME)) {
      console.warn(`[seedUnits] Church missing "${MAIN_MINISTRY_NAME}" ministry. Units cannot be scoped correctly.`);
      return { created: 0, warning: 'main ministry missing' };
    }

    let created = 0;
    let updated = 0;
    for (const unitName of DEFAULT_UNITS) {
      const res = await Unit.updateOne(
        { name: unitName },
        {
          $set: {
            church: churchId,
            ministryName: MAIN_MINISTRY_NAME,
          },
          $setOnInsert: { name: unitName },
        },
        { upsert: true }
      );

      if (res.upsertedCount) {
        created += res.upsertedCount;
      } else if (res.modifiedCount) {
        updated += res.modifiedCount;
      }
    }

    if (updated) {
      console.log(`[seedUnits] Updated ${updated} units to ensure church/ministry linkage.`);
    }
    console.log(`[seedUnits] Created ${created} default units.`);
    return { created, updated };
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
