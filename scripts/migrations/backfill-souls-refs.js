#!/usr/bin/env node
/**
 * Migration: backfill-souls-refs
 * - Ensures each Soul has unit and addedBy refs.
 * - Strategy:
 *   - If addedBy missing: skip (cannot infer safely without audit trail)
 *   - If unit missing: try to infer from the author's active role unit, else any role with unit.
 * - Supports DRY-RUN by default. Pass --apply to write changes.
 * - Optional filters: --onlyMissingUnit, --onlyMissingAddedBy, --limit=N, --user=<id>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Soul = require('../../src/models/Soul');
const User = require('../../src/models/User');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/soj';

function parseArgs(){
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a=>a.startsWith('--')).map(a=>a.replace(/=.*/,'')));
  const get = (k, def)=>{
    const hit = args.find(a=>a.startsWith(`--${k}=`));
    if (!hit) return def;
    const v = hit.split('=').slice(1).join('=');
    return v;
  };
  return {
    apply: flags.has('--apply'),
    onlyMissingUnit: flags.has('--onlyMissingUnit'),
    onlyMissingAddedBy: flags.has('--onlyMissingAddedBy'),
    limit: parseInt(get('limit','0'),10) || 0,
    user: get('user', null)
  };
}

async function resolveUserUnit(userId){
  if (!userId) return null;
  const u = await User.findById(userId).lean();
  if (!u) return null;
  const act = u.activeRole;
  const active = (u.roles||[]).find(r=>r.role===act && r.unit);
  if (active && active.unit) return active.unit;
  const any = (u.roles||[]).find(r=>r.unit);
  return any ? any.unit : null;
}

async function run(){
  const opts = parseArgs();
  console.log(`[backfill-souls-refs] Connecting to ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  console.log('[backfill-souls-refs] Connected');

  const filter = {};
  if (opts.onlyMissingUnit) filter.unit = { $in: [null, undefined] };
  if (opts.onlyMissingAddedBy) filter.addedBy = { $in: [null, undefined] };
  if (opts.user) filter.addedBy = new mongoose.Types.ObjectId(String(opts.user));

  // If no explicit filter given, target souls missing either of refs
  if (!opts.onlyMissingUnit && !opts.onlyMissingAddedBy && !opts.user) {
    filter.$or = [{ unit: { $in: [null, undefined] } }, { addedBy: { $in: [null, undefined] } }];
  }

  let q = Soul.find(filter);
  if (opts.limit > 0) q = q.limit(opts.limit);
  const souls = await q.lean();

  console.log(`[backfill-souls-refs] Found ${souls.length} candidate souls`);
  let updated = 0, skipped = 0, couldNotInfer = 0;

  for (const s of souls){
    const changes = {};
    const before = { unit: s.unit, addedBy: s.addedBy };

    if (!s.addedBy){
      // We do not have a safe way to infer the author; skip
      skipped++;
      continue;
    }
    if (!s.unit){
      const inferredUnit = await resolveUserUnit(s.addedBy);
      if (inferredUnit){
        changes.unit = inferredUnit;
      } else {
        couldNotInfer++;
      }
    }

    if (Object.keys(changes).length === 0){
      skipped++;
      continue;
    }

    if (opts.apply){
      await Soul.updateOne({ _id: s._id }, { $set: changes });
    }
    updated++;
    console.log(`[soul ${s._id}] ${opts.apply? 'APPLIED':'DRY-RUN'} changes:`, { before, changes });
  }

  console.log(`[backfill-souls-refs] Done. Updated:${updated} Skipped:${skipped} CouldNotInferUnit:${couldNotInfer} Apply:${opts.apply}`);
  await mongoose.disconnect();
}

run().catch(async (e)=>{
  console.error('[backfill-souls-refs] ERROR', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
