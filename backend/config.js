// Loads the per-deployment org config (departments, branding, evaluation criteria...).
// Path can be overridden with ORG_CONFIG; defaults to config/org.config.json at the repo root.
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.ORG_CONFIG
  ? path.resolve(process.env.ORG_CONFIG)
  : path.join(__dirname, '../config/org.config.json');

const ASSETS_DIR = process.env.ORG_ASSETS_DIR
  ? path.resolve(process.env.ORG_ASSETS_DIR)
  : path.join(path.dirname(CONFIG_PATH), 'assets');

function fail(msg) {
  throw new Error(`[org config] ${CONFIG_PATH}: ${msg}`);
}

function load() {
  if (!fs.existsSync(CONFIG_PATH)) fail('file not found (copy config/org.config.example.json)');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    fail(`invalid JSON - ${e.message}`);
  }

  if (!Array.isArray(cfg.departments) || cfg.departments.length === 0) fail('"departments" must be a non-empty array');
  const codes = new Set();
  for (const d of cfg.departments) {
    if (!d.code || typeof d.code !== 'string') fail('every department needs a string "code"');
    if (codes.has(d.code)) fail(`duplicate department code "${d.code}"`);
    codes.add(d.code);
    d.shortName = d.shortName || d.code;
    d.name = d.name || d.shortName;
  }

  const ev = cfg.evaluation || {};
  if (!Array.isArray(ev.criteria) || ev.criteria.length === 0) fail('"evaluation.criteria" must be a non-empty array');
  const keys = new Set();
  for (const c of ev.criteria) {
    if (!c.key) fail('every evaluation criterion needs a "key"');
    if (keys.has(c.key)) fail(`duplicate criterion key "${c.key}"`);
    keys.add(c.key);
    c.label = c.label || c.key;
    c.shortLabel = c.shortLabel || c.label;
    c.min = Number.isFinite(c.min) ? c.min : 1;
    c.max = Number.isFinite(c.max) ? c.max : 10;
    c.default = Number.isFinite(c.default) ? c.default : Math.round((c.min + c.max) / 2);
    if (c.min >= c.max) fail(`criterion "${c.key}": min must be < max`);
  }
  if (!Array.isArray(ev.results) || ev.results.length === 0) fail('"evaluation.results" must be a non-empty array');
  ev.results = ev.results.map(r => (typeof r === 'string' ? { value: r } : r));

  cfg.candidate = {
    codeLabel: 'Mã ứng viên',
    nameFields: ['Họ và tên', 'Họ tên', 'fullName'],
    phoneFields: ['Điện thoại', 'Số điện thoại'],
    hiddenFields: [],
    ...(cfg.candidate || {}),
  };
  cfg.branding = cfg.branding || {};
  cfg.appTitle = cfg.appTitle || 'Hệ thống phỏng vấn';
  cfg.systemName = cfg.systemName || cfg.appTitle;
  cfg.waitWarningMinutes = cfg.waitWarningMinutes || 30;
  // false: interviewers only call candidates by hand (no auto-dispatch loop, no toggle)
  if (cfg.autoAssign === undefined) cfg.autoAssign = true;
  if (typeof cfg.autoAssign !== 'boolean') fail('"autoAssign" must be true or false');
  return cfg;
}

const config = load();
const departmentCodes = config.departments.map(d => d.code);

module.exports = {
  config,
  ASSETS_DIR,
  departmentCodes,
  defaultDepartment: departmentCodes[0],
  isValidDepartment: code => departmentCodes.includes(code),
  isValidResult: value => config.evaluation.results.some(r => r.value === value),
  getCandidateName: c => {
    const d = (c && c.applicationData) || {};
    for (const f of config.candidate.nameFields) if (d[f]) return d[f];
    return null;
  },
};
