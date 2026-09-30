// Import staff accounts from Excel/CSV.
//
//   node scripts/import-staff.js <file.xlsx> [--sheet <name>] [--replace]
//
// Columns: username (required), fullName, department (config code; default = first department),
//          roles (comma separated: admin, interviewer, receptionist; default = interviewer)
// All staff log in with the deployment's STAFF_PASSWORD.
// Existing accounts (same username) are updated; their active role is kept while still granted. --replace first deletes every account.
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
require('dotenv').config();
const User = require('../models/User');
const { plan, apply } = require('../importers/staff');

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

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview');
  let p;
  try {
    p = await plan({ rows, strict: true }); // throws on the first bad row, before anything is written
  } catch (err) { await mongoose.disconnect(); throw err; }
  if (argv.includes('--replace')) {
    const { deletedCount } = await User.deleteMany({});
    console.log(`Deleted ${deletedCount} existing accounts.`);
    p = await plan({ rows, strict: true });
  }
  await apply(p);
  const users = p.accounts;
  console.log(`Imported ${users.length} staff accounts (${users.filter(u => u.roles.includes('admin')).length} admins).`);
  if (!users.some(u => u.roles.includes('admin'))) console.warn('Warning: no admin in this file.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
