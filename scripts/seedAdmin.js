/**
 * Seed a Super Admin into the local MongoDB.
 * Usage:
 *   - copy .env.example to .env and edit values
 *   - run: node scripts/seedAdmin.js
 *
 * You can also import { seedSuperAdmin } in other scripts.
 */
const bcrypt = require('bcrypt');
require('dotenv').config();
const User = require('../src/models/User');
const connectDB = require('../src/config/db');
const { normalizeNigeriaPhone } = require('../src/utils/phone');

/**
 * Creates a Super Admin account if not already present.
 */
async function seedSuperAdmin(data) {
  await connectDB();

  const { title, firstName, middleName, surname, email, phone: rawPhone, password } = data;

  if (!title || !firstName || !surname || !email || !rawPhone || !password) {
    return { isError: true, status: "incomplete", message: "Missing required fields" };
  }

  const phone = normalizeNigeriaPhone(rawPhone);

  const existing = await User.findOne({ phone });
  if (existing) {
    console.log('⚠️ Super admin already exists:', existing.phone);
    return {isError:false,existing};
  }
  if(!title || !firstName || !middleName || !surname || !email) return  {isError:true, status:"uncomplete"};

  const hash = await bcrypt.hash(password, 10);
  const user = new User({
    title,
    firstName,
    middleName,
    surname,
    phone,
    email,
    passwordHash: hash,
    isVerified: false,
    roles: [{ role: 'SuperAdmin', unit: null }],
    activeRole: 'SuperAdmin'
  });

  await user.save();
  console.log('✅ Created Super Admin:', phone, 'password:', password);
  return {isError:false, user, status:"success"};
}

// Run directly (only if called with "node scripts/seedAdmin.js")

// Export for re-use in other scripts/tests
module.exports = { seedSuperAdmin };
