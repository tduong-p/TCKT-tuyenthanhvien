import React, { createContext, useContext, useEffect, useState } from 'react';

// Org-specific settings (departments, branding, evaluation criteria) served by the backend
// from config/org.config.json. Everything that used to be hardcoded for one unit reads from here.
const OrgConfigContext = createContext(null);

export function OrgConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/public/config')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(cfg => {
        setConfig(cfg);
        document.title = cfg.appTitle;
        if (cfg.branding?.favicon) {
          let link = document.querySelector("link[rel='icon']");
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = cfg.branding.favicon;
        }
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold p-8 text-center">Không tải được cấu hình hệ thống ({error}). Vui lòng tải lại trang.</div>;
  }
  if (!config) return null;
  return <OrgConfigContext.Provider value={config}>{children}</OrgConfigContext.Provider>;
}

export function useOrgConfig() {
  const config = useContext(OrgConfigContext);
  const departments = config.departments;
  const defaultDepartment = departments[0].code;
  const findDept = code => departments.find(d => d.code === code);

  return {
    config,
    departments,
    defaultDepartment,
    criteria: config.evaluation.criteria,
    results: config.evaluation.results,
    codeLabel: config.candidate.codeLabel,
    deptName: code => findDept(code)?.name || code,
    deptShortName: code => findDept(code)?.shortName || code,
    deptTheme: code => DEPT_THEMES[findDept(code)?.theme] || DEPT_THEMES.blue,
    // Records created before a department was set belong to the default department
    inDepartment: (record, code) => record.department === code || (!record.department && code === defaultDepartment),
    getCandidateName: c => {
      const d = c?.applicationData || {};
      for (const f of config.candidate.nameFields) if (d[f]) return d[f];
      return '';
    },
    getCandidatePhone: c => {
      const d = c?.applicationData || {};
      for (const f of config.candidate.phoneFields) if (d[f]) return d[f];
      return '';
    },
    getScore: (evaluation, key) => {
      const s = evaluation.scores?.find(x => x.key === key);
      return s ? s.score : evaluation[`${key}Score`];
    },
    getAverage: evaluation => {
      if (Number.isFinite(evaluation.averageScore)) return evaluation.averageScore;
      const vals = config.evaluation.criteria
        .map(c => Number(evaluation.scores?.find(x => x.key === c.key)?.score ?? evaluation[`${c.key}Score`]))
        .filter(Number.isFinite);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : 0;
    },
    resultTone: value => RESULT_TONES[config.evaluation.results.find(r => r.value === value)?.tone] || RESULT_TONES.neutral,
  };
}

// Full class strings (not interpolated) so Tailwind can see them at build time.
export const DEPT_THEMES = {
  blue: {
    panel: 'from-blue-900/80 to-indigo-900/80 border-blue-400/30 shadow-[0_0_50px_rgba(37,99,235,0.2)]',
    divider: 'border-blue-500/30', heading: 'text-blue-300', empty: 'text-blue-300/50',
    solid: 'bg-blue-600', muted: 'text-blue-200',
    chip: 'bg-blue-500/20 text-blue-100 border-blue-400/30', chipIndex: 'text-blue-200', chipSub: 'text-blue-300',
  },
  emerald: {
    panel: 'from-emerald-900/80 to-teal-900/80 border-emerald-400/30 shadow-[0_0_50px_rgba(16,185,129,0.2)]',
    divider: 'border-emerald-500/30', heading: 'text-emerald-300', empty: 'text-emerald-300/50',
    solid: 'bg-emerald-600', muted: 'text-emerald-200',
    chip: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30', chipIndex: 'text-emerald-200', chipSub: 'text-emerald-300',
  },
  purple: {
    panel: 'from-purple-900/80 to-fuchsia-900/80 border-purple-400/30 shadow-[0_0_50px_rgba(147,51,234,0.2)]',
    divider: 'border-purple-500/30', heading: 'text-purple-300', empty: 'text-purple-300/50',
    solid: 'bg-purple-600', muted: 'text-purple-200',
    chip: 'bg-purple-500/20 text-purple-100 border-purple-400/30', chipIndex: 'text-purple-200', chipSub: 'text-purple-300',
  },
  rose: {
    panel: 'from-rose-900/80 to-pink-900/80 border-rose-400/30 shadow-[0_0_50px_rgba(225,29,72,0.2)]',
    divider: 'border-rose-500/30', heading: 'text-rose-300', empty: 'text-rose-300/50',
    solid: 'bg-rose-600', muted: 'text-rose-200',
    chip: 'bg-rose-500/20 text-rose-100 border-rose-400/30', chipIndex: 'text-rose-200', chipSub: 'text-rose-300',
  },
  amber: {
    panel: 'from-amber-900/80 to-orange-900/80 border-amber-400/30 shadow-[0_0_50px_rgba(217,119,6,0.2)]',
    divider: 'border-amber-500/30', heading: 'text-amber-300', empty: 'text-amber-300/50',
    solid: 'bg-amber-600', muted: 'text-amber-200',
    chip: 'bg-amber-500/20 text-amber-100 border-amber-400/30', chipIndex: 'text-amber-200', chipSub: 'text-amber-300',
  },
  cyan: {
    panel: 'from-cyan-900/80 to-sky-900/80 border-cyan-400/30 shadow-[0_0_50px_rgba(8,145,178,0.2)]',
    divider: 'border-cyan-500/30', heading: 'text-cyan-300', empty: 'text-cyan-300/50',
    solid: 'bg-cyan-600', muted: 'text-cyan-200',
    chip: 'bg-cyan-500/20 text-cyan-100 border-cyan-400/30', chipIndex: 'text-cyan-200', chipSub: 'text-cyan-300',
  },
};

const RESULT_TONES = {
  success: { badge: 'bg-gradient-to-r from-emerald-500 to-green-500 text-white', card: 'bg-emerald-50 border-emerald-100', label: 'text-emerald-600', value: 'text-emerald-800' },
  danger: { badge: 'bg-gradient-to-r from-red-500 to-rose-500 text-white', card: 'bg-red-50 border-red-100', label: 'text-red-600', value: 'text-red-800' },
  warning: { badge: 'bg-gradient-to-r from-orange-400 to-amber-500 text-white', card: 'bg-amber-50 border-amber-100', label: 'text-amber-600', value: 'text-amber-800' },
  neutral: { badge: 'bg-slate-500 text-white', card: 'bg-slate-50 border-slate-200', label: 'text-slate-600', value: 'text-slate-800' },
};
