// Script to seed default ministry units if they do not already exist.
// Usage: node scripts/seedUnits.js (normally invoked automatically on server start)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Unit = require('../src/models/Unit');
const Church = require('../src/models/Church');

const MAIN_CHURCH_SLUG = 'soj-umuahia';
const MAIN_MINISTRY_NAME = 'Main Church';
const YOUTH_MINISTRY_NAME = 'Youth and Singles Church';

const MAIN_CHURCH_UNITS = [
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

const YOUTH_MINISTRY_UNITS = [
  'Jubilee Fountains Music',
  'Media sound',
  'Media projection',
  'Media photography and video',
  'Social media & content unit',
  'Event Compere & stage managers',
  'Jubilee pilot',
  'Greeters',
  'Program logistics & transport unit',
  'Evangelism & outreach Unit',
  'Singles Temple keepers',
  'Triumphant Drama Family',
  'Capacity & business development unit',
  'Follow up unit',
  'Creatives unit',
  'Artisans unit',
  'Welfare and CSR Unit',
  'SOJ Y&S Tech Community'
];

const UNIT_SEED_MATRIX = [
  { churchSlug: MAIN_CHURCH_SLUG, ministryName: MAIN_MINISTRY_NAME, unitNames: MAIN_CHURCH_UNITS },
  { churchSlug: MAIN_CHURCH_SLUG, ministryName: YOUTH_MINISTRY_NAME, unitNames: YOUTH_MINISTRY_UNITS }
];

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedUnits() {
  try {
    await connectDB();

    const results = [];
    for (const entry of UNIT_SEED_MATRIX) {
      const { churchSlug, ministryName, unitNames } = entry;

      const church = await Church.findOne({ slug: churchSlug }).lean();
      if (!church) {
        console.warn(`[seedUnits] Church with slug "${churchSlug}" not found. Skipping ${ministryName} units.`);
        results.push({ churchSlug, ministryName, created: 0, updated: 0, skipped: unitNames.length, warning: 'church missing' });
        continue;
      }

      if (!Array.isArray(church.ministries) || !church.ministries.some((m) => m?.name === ministryName)) {
        console.warn(`[seedUnits] Church "${church.name}" missing ministry "${ministryName}". Units cannot be scoped correctly.`);
        results.push({ churchSlug, ministryName, created: 0, updated: 0, skipped: unitNames.length, warning: 'ministry missing' });
        continue;
      }

      const churchId = church._id;
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const rawName of unitNames) {
        const unitName = rawName.trim();
        if (!unitName) {
          skipped += 1;
          continue;
        }
        const regex = new RegExp(`^${escapeRegex(unitName)}$`, 'i');
        const existing = await Unit.findOne({ name: regex });

        if (existing) {
          const existingChurch = existing.church ? existing.church.toString() : null;
          const targetChurch = churchId.toString();
          const existingMinistry = existing.ministryName || null;

          const alreadyCorrect = existingChurch === targetChurch && existingMinistry === ministryName;
          const canReassign = (!existingChurch || existingChurch === targetChurch) && (!existingMinistry || existingMinistry === ministryName);

          if (alreadyCorrect) {
            // Ensure canonical casing of the name if needed
            if (existing.name !== unitName) {
              existing.name = unitName;
              await existing.save();
            }
            continue;
          }

          if (!canReassign) {
            console.warn(`[seedUnits] Skipping unit "${existing.name}" – already linked to church=${existingChurch || 'none'} ministry=${existingMinistry || 'none'}`);
            skipped += 1;
            continue;
          }

          existing.church = churchId;
          existing.ministryName = ministryName;
          if (existing.name !== unitName) {
            existing.name = unitName;
          }
          await existing.save();
          updated += 1;
          continue;
        }

        await Unit.create({ name: unitName, church: churchId, ministryName });
        created += 1;
      }

      console.log(`[seedUnits] ${church.name} :: ${ministryName} → created=${created}, updated=${updated}, skipped=${skipped}`);
      results.push({ churchSlug, ministryName, created, updated, skipped });
    }

    const summary = results.reduce((acc, item) => {
      acc.created += item.created || 0;
      acc.updated += item.updated || 0;
      acc.skipped += item.skipped || 0;
      return acc;
    }, { created: 0, updated: 0, skipped: 0 });

    return { ...summary, breakdown: results };
  } catch (err) {
    console.error('[seedUnits] Error seeding units:', err.message);
    return { error: err.message };
  } finally {
    if (require.main === module) {
      await mongoose.connection.close();
    }
  }
}

module.exports = { seedUnits, MAIN_CHURCH_UNITS, YOUTH_MINISTRY_UNITS };

if (require.main === module) {
  seedUnits().then(() => {
    console.log('[seedUnits] Done');
  });
}
