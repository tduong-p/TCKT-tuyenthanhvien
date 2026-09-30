// Staff import shared by the CLI (scripts/import-staff.js) and the admin web import.
// plan() only reads the database; apply() writes exactly what plan() computed.
const { isValidDepartment, defaultDepartment, departmentCodes } = require('../config');
const User = require('../models/User');

const VALID_ROLES = ['admin', 'interviewer', 'receptionist'];
const ROLE_PRIORITY = ['admin', 'receptionist', 'interviewer'];

// Keep the active role while it is still granted, otherwise take the highest-privilege one
const pickRole = (roles, current) => (current && roles.includes(current) ? current : ROLE_PRIORITY.find(r => roles.includes(r)));

// strict (CLI): the first bad row throws. Otherwise (web): bad rows go to `skipped` with the reason.
// actor: username of the admin running the import; they can neither lose admin nor be removed.
async function plan({ rows, removeMissing = false, actor = null, strict = false }) {
  const skipped = [];
  // The CLI keeps its English messages; the web preview shows Vietnamese ones
  const reject = (line, en, vi) => { if (strict) throw new Error(`Line ${line}: ${en}`); skipped.push({ line, reason: vi }); };

  const byName = new Map(); // later rows win
  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const username = String(row.username ?? '').trim();
    if (!username) { if (!strict) skipped.push({ line, reason: 'thiếu username' }); return; }
    const department = String(row.department ?? '').trim() || defaultDepartment;
    if (!isValidDepartment(department)) return reject(line, `unknown department "${department}" (configured: ${departmentCodes.join(', ')})`, `ban không hợp lệ "${department}" (có: ${departmentCodes.join(', ')})`);
    const roles = String(row.roles ?? '').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
    if (!roles.length) roles.push('interviewer');
    const bad = roles.filter(r => !VALID_ROLES.includes(r));
    if (bad.length) return reject(line, `unknown role(s) ${bad.join(', ')} (allowed: ${VALID_ROLES.join(', ')})`, `vai trò không hợp lệ: ${bad.join(', ')} (chỉ có: ${VALID_ROLES.join(', ')})`);
    if (actor && username === actor && !roles.includes('admin')) {
      skipped.push({ line, reason: 'không thể tự bỏ quyền admin của chính mình' });
      return;
    }
    byName.set(username, { username, fullName: String(row.fullName ?? '').trim() || username, department, roles });
  });
  if (strict && byName.size === 0) throw new Error('No rows with a "username" column found');

  const existing = new Map((await User.find().lean()).map(u => [u.username, u]));
  const result = { create: [], update: [], unchanged: 0, skipped, remove: [], accounts: [...byName.values()] };
  for (const u of byName.values()) {
    const cur = existing.get(u.username);
    if (!cur) result.create.push({ ...u, role: pickRole(u.roles) });
    else if (cur.fullName === u.fullName && cur.department === u.department && JSON.stringify(cur.roles || []) === JSON.stringify(u.roles)) result.unchanged++;
    else result.update.push({ ...u, role: pickRole(u.roles, cur.role) });
  }

  if (removeMissing) {
    const gone = [...existing.values()].filter(u => !byName.has(u.username) && u.username !== actor);
    const busy = gone.filter(u => u.status === 'interviewing').map(u => u.username);
    if (busy.length) return { error: `Đang phỏng vấn, không thể xoá: ${busy.join(', ')}`, status: 409 };
    result.remove = gone.map(u => u.username);
  }
  return result;
}

async function apply(p) {
  for (const u of [...p.create, ...p.update]) {
    await User.updateOne({ username: u.username }, { $set: u }, { upsert: true });
  }
  let removed = 0;
  if (p.remove.length) ({ deletedCount: removed } = await User.deleteMany({ username: { $in: p.remove } }));
  return { created: p.create.length, updated: p.update.length, removed };
}

module.exports = { VALID_ROLES, ROLE_PRIORITY, pickRole, plan, apply };
