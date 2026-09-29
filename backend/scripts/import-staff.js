// Import staff accounts from Excel/CSV.
//
//   node scripts/import-staff.js <file.xlsx> [--sheet <name>] [--replace]
//
// Columns: username (required), fullName, department (config code; default = first department),
//          roles (comma separated: admin, interviewer, receptionist; default = interviewer)
// All staff log in with the deployment's STAFF_PASSWORD.
// Existing accounts (same username) are updated. --replace first deletes every account.
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
require('dotenv').config();
const { isValidDepartment, defaultDepartment, departmentCodes } = require('../config');
const User = require('../models/User');

const VALID_ROLES = ['admin', 'interviewer', 'receptionist'];

async function run() {
  const argv = process.argv.slice(2);
  const sheetIdx = argv.indexOf('--sheet');
  const file = argv.find((a, i) => !a.startsWith('--') && !(sheetIdx !== -1 && i === sheetIdx + 1));
  if (!file) {
    console.log('Usage: node scripts/import-staff.js <file.xlsx> [--sheet <name>] [--replace]');
    process.exit(1);
  }
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

  const wb = xlsx.readFile(file);
  const sheetName = sheetIdx !== -1 ? argv[sheetIdx + 1] : wb.SheetNames[0];
  if (!wb.Sheets[sheetName]) throw new Error(`Sheet "${sheetName}" not found. Sheets: ${wb.SheetNames.join(', ')}`);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const users = [];
  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const username = String(row.username || '').trim();
    if (!username) return;
    const department = String(row.department || '').trim() || defaultDepartment;
    if (!isValidDepartment(department)) throw new Error(`Line ${line}: unknown department "${department}" (configured: ${departmentCodes.join(', ')})`);
    const roles = String(row.roles || 'interviewer').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
    const bad = roles.filter(r => !VALID_ROLES.includes(r));
    if (bad.length) throw new Error(`Line ${line}: unknown role(s) ${bad.join(', ')} (allowed: ${VALID_ROLES.join(', ')})`);
    // Active role = highest privilege, same rule as the admin UI
    const role = ['admin', 'receptionist', 'interviewer'].find(r => roles.includes(r));
    users.push({ username, fullName: String(row.fullName || '').trim() || username, department, roles, role });
  });
  if (users.length === 0) throw new Error('No rows with a "username" column found');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview');
  if (argv.includes('--replace')) {
    const { deletedCount } = await User.deleteMany({});
    console.log(`Deleted ${deletedCount} existing accounts.`);
  }
  for (const u of users) {
    await User.updateOne({ username: u.username }, { $set: u }, { upsert: true });
  }
  console.log(`Imported ${users.length} staff accounts (${users.filter(u => u.roles.includes('admin')).length} admins).`);
  if (!users.some(u => u.roles.includes('admin'))) console.warn('Warning: no admin in this file.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
