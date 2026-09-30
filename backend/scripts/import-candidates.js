// Import candidates from an Excel/CSV export (e.g. Google/Microsoft Forms) into one department.
//
//   node scripts/import-candidates.js <file.xlsx> --department <CODE> [--code-column "MSSV"] [--sheet <name>] [--replace]
//
// Every column of the row is kept as applicationData (shown to interviewers).
// Existing candidates (same code + department) are updated, their interview status is kept.
// --replace also deletes candidates of that department missing from the file; refused once
// anyone of that department has checked in or been evaluated.
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');
require('dotenv').config();
const { config, isValidDepartment, departmentCodes } = require('../config');
const { plan, apply } = require('../importers/candidates');

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

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview');
  const p = await plan({ department, codeColumn, rows, replace: !!args.replace });
  if (p.error) { await mongoose.disconnect(); throw new Error(p.error); }
  const { created, updated, removed } = await apply(department, p);
  if (args.replace) console.log(`Deleted ${removed} candidates of ${department} not in the file.`);
  console.log(`${department}: ${created} created, ${updated + p.unchanged} updated, ${p.skipped.length} rows skipped (empty ${codeColumn}).`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
