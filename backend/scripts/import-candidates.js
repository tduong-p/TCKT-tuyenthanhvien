// Import candidates from an Excel/CSV export (e.g. Google/Microsoft Forms) into one department.
//
//   node scripts/import-candidates.js <file.xlsx> --department <CODE> [--code-column "MSSV"] [--sheet <name>] [--replace]
//
// Every column of the row is kept as applicationData (shown to interviewers).
// Existing candidates (same code + department) are updated, their interview status is kept.
// --replace first deletes every candidate of that department.
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
require('dotenv').config();
const { config, isValidDepartment, departmentCodes } = require('../config');
const Candidate = require('../models/Candidate');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(argv[i]);
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  const department = args.department;
  const codeColumn = args['code-column'] || config.candidate.codeLabel;
  if (!file || !department) {
    console.log('Usage: node scripts/import-candidates.js <file.xlsx> --department <CODE> [--code-column "MSSV"] [--sheet <name>] [--replace]');
    process.exit(1);
  }
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (!isValidDepartment(department)) throw new Error(`Unknown department "${department}". Configured: ${departmentCodes.join(', ')}`);

  const wb = xlsx.readFile(file);
  const sheetName = args.sheet || wb.SheetNames[0];
  if (!wb.Sheets[sheetName]) throw new Error(`Sheet "${sheetName}" not found. Sheets: ${wb.SheetNames.join(', ')}`);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new Error('Sheet is empty');
  if (!(codeColumn in rows[0])) {
    throw new Error(`Column "${codeColumn}" not found. Columns: ${Object.keys(rows[0]).join(', ')}\nUse --code-column to pick the candidate code column.`);
  }

  // Later rows win (a candidate who re-submitted the form keeps their latest answers)
  const byCode = new Map();
  let skipped = 0;
  for (const row of rows) {
    const code = String(row[codeColumn]).trim().toUpperCase(); // login upper-cases the code
    if (!code) { skipped++; continue; }
    const data = {};
    for (const [k, v] of Object.entries(row)) {
      let value = v instanceof Date ? v.toISOString() : String(v).trim();
      // Excel drops the leading 0 of phone numbers stored as numbers
      if (config.candidate.phoneFields.includes(k) && /^\d{8,}$/.test(value) && !value.startsWith('0')) value = '0' + value;
      if (value !== '') data[k] = value;
    }
    byCode.set(code, data);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview');

  if (args.replace) {
    const { deletedCount } = await Candidate.deleteMany({ department });
    console.log(`Deleted ${deletedCount} existing candidates of ${department}.`);
  }

  let created = 0, updated = 0;
  for (const [interviewCode, applicationData] of byCode) {
    const res = await Candidate.updateOne(
      { interviewCode, department },
      { $set: { applicationData }, $setOnInsert: { status: 'active' } },
      { upsert: true }
    );
    if (res.upsertedCount) created++; else updated++;
  }
  console.log(`${department}: ${created} created, ${updated} updated, ${skipped} rows skipped (empty ${codeColumn}).`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
