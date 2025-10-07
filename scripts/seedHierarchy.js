#!/usr/bin/env node
// Seeds default organization, church, and ministries.
require('dotenv').config();
const mongoose = require('mongoose');
const Organization = require('../src/models/Organization');
const Church = require('../src/models/Church');

(async function(){
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/soj';
    await mongoose.connect(uri);
    console.log('[seedHierarchy] Connected');
    const orgName = 'Streams of Joy';
    const orgSlug = 'streams-of-joy';
    let org = await Organization.findOne({ slug: orgSlug });
    if(!org){
      org = await Organization.create({ name: orgName, slug: orgSlug });
      console.log('[seedHierarchy] Created organization');
    } else {
      console.log('[seedHierarchy] Organization exists');
    }
    const churchName = 'SOJ Umuahia';
    const churchSlug = 'soj-umuahia';
    let church = await Church.findOne({ slug: churchSlug });
    if(!church){
      church = await Church.create({ organization: org._id, name: churchName, slug: churchSlug, ministries: [ { name: 'Main Church' }, { name: 'Youth and Singles Church' } ] });
      console.log('[seedHierarchy] Created church with default ministries');
    } else {
      // Ensure ministries baseline exist
      const needed = ['Main Church','Youth and Singles Church'];
      let changed = false;
      needed.forEach(n=>{ if(!church.ministries.some(m=>m.name===n)){ church.ministries.push({ name:n }); changed=true; }});
      if(changed){ await church.save(); console.log('[seedHierarchy] Updated church ministries'); }
      else console.log('[seedHierarchy] Church exists with ministries');
    }
    console.log('[seedHierarchy] Done');
    process.exit(0);
  } catch (e) {
    console.error('[seedHierarchy] Failed', e);
    process.exit(1);
  }
})();
