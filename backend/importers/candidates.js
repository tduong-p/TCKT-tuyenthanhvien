// Candidate import shared by the CLI (scripts/import-candidates.js) and the admin web import.
// plan() only reads the database; apply() writes exactly what plan() computed.
const { config, isValidDepartment, departmentCodes } = require('../config');
const Candidate = require('../models/Candidate');
const Evaluation = require('../models/Evaluation');

// Columns our own export adds (status, room, score...). Ignored on import so an export re-imports cleanly.
const SYSTEM_PREFIX = '[HT] ';

// Rows (sheet_to_json objects) → Map(code → applicationData). Later rows win
// (a candidate who re-submitted the form keeps their latest answers).
function normalizeRows(rows, codeColumn) {
  const byCode = new Map();
  const skipped = [];
  rows.forEach((row, i) => {
    const code = String(row[codeColumn] ?? '').trim().toUpperCase(); // login upper-cases the code
    if (!code) { skipped.push({ line: i + 2, reason: `thiếu ${codeColumn}` }); return; }
    const data = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith(SYSTEM_PREFIX)) continue;
      let value = v instanceof Date ? v.toISOString() : String(v ?? '').trim();
      // Excel drops the leading 0 of phone numbers stored as numbers
      if (config.candidate.phoneFields.includes(k) && /^\d{8,}$/.test(value) && !value.startsWith('0')) value = '0' + value;
      if (value !== '') data[k] = value;
    }
    byCode.set(code, data);
  });
  return { byCode, skipped };
}

const sameData = (a = {}, b = {}) => {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

async function plan({ department, codeColumn = config.candidate.codeLabel, rows, replace = false }) {
  if (!isValidDepartment(department)) {
    return { error: `Unknown department "${department}". Configured: ${departmentCodes.join(', ')}`, status: 400 };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'Sheet is empty', status: 400 };
  if (!(codeColumn in rows[0])) {
    return { error: `Column "${codeColumn}" not found. Columns: ${Object.keys(rows[0]).join(', ')}`, status: 400 };
  }

  const { byCode, skipped } = normalizeRows(rows, codeColumn);
  const existing = new Map((await Candidate.find({ department }).lean()).map(c => [c.interviewCode, c]));

  const result = { create: [], update: [], unchanged: 0, skipped, remove: [] };
  for (const [interviewCode, applicationData] of byCode) {
    const cur = existing.get(interviewCode);
    if (!cur) result.create.push({ interviewCode, applicationData });
    else if (sameData(cur.applicationData, applicationData)) result.unchanged++;
    else result.update.push({ interviewCode, applicationData });
  }

  if (replace) {
    const started = await Candidate.exists({ department, status: { $ne: 'active' } }) || await Evaluation.exists({ department });
    if (started) {
      return { error: `Đơn vị ${department} đã có ứng viên check-in hoặc đã chấm — không thể thay toàn bộ danh sách (already checked in)`, status: 409 };
    }
    result.remove = [...existing.keys()].filter(code => !byCode.has(code));
  }
  return result;
}

async function apply(department, p) {
  for (const { interviewCode, applicationData } of [...p.create, ...p.update]) {
    await Candidate.updateOne(
      { interviewCode, department },
      { $set: { applicationData }, $setOnInsert: { status: 'active' } },
      { upsert: true }
    );
  }
  let removed = 0;
  if (p.remove.length) ({ deletedCount: removed } = await Candidate.deleteMany({ department, interviewCode: { $in: p.remove } }));
  return { created: p.create.length, updated: p.update.length, removed };
}

module.exports = { SYSTEM_PREFIX, normalizeRows, plan, apply };
