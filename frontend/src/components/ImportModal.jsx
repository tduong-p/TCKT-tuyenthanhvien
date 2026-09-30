import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Upload } from 'lucide-react';
import { readWorkbook } from '../lib/excel';

// Excel import with a server-side preview (dryRun) before anything is written.
// kind: 'candidates' | 'staff'
export default function ImportModal({ kind, open, onClose, onDone, departments = [], defaultDepartment, codeLabel }) {
  const [book, setBook] = useState(null);
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState('');
  const [department, setDepartment] = useState(defaultDepartment);
  const [codeColumn, setCodeColumn] = useState(codeLabel);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const isCandidates = kind === 'candidates';
  const rows = book && sheet ? book.rowsOf(sheet) : [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  // Any change to the input invalidates the preview
  const changed = fn => (...args) => { setPreview(null); setError(''); fn(...args); };

  const pickFile = changed(async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const wb = await readWorkbook(file);
      setBook(wb);
      setFileName(file.name);
      setSheet(wb.sheetNames[0]);
      const first = wb.rowsOf(wb.sheetNames[0])[0] || {};
      if (isCandidates) setCodeColumn(codeLabel in first ? codeLabel : Object.keys(first)[0] || codeLabel);
    } catch (err) {
      setError('Không đọc được file: ' + err.message);
    }
  });

  const send = async dryRun => {
    setBusy(true);
    setError('');
    try {
      const body = isCandidates
        ? { department, codeColumn, rows, replace: removeMissing, dryRun }
        : { rows, removeMissing, dryRun };
      const res = await fetch(`/api/admin/import/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setPreview(null); setError(data.message || data.error || `Lỗi ${res.status}`); return; }
      if (dryRun) { setPreview(data); return; }
      toast.success(`Đã nhập: ${data.created} mới, ${data.updated} cập nhật${data.removed ? `, ${data.removed} đã xoá` : ''}`);
      close();
      onDone && onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setBook(null); setFileName(''); setSheet(''); setPreview(null); setError(''); setRemoveMissing(false);
    onClose();
  };

  const label = 'block text-sm font-bold text-slate-600 mb-1';
  const input = 'w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-slate-800">{isCandidates ? 'Nhập ứng viên từ Excel' : 'Nhập nhân sự từ Excel'}</h3>
          <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={22} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={label}>File (.xlsx, .xls, .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={pickFile} className={input} />
            {!isCandidates && <p className="text-xs text-slate-500 mt-1">Cột: username, fullName, department, roles (vd: "admin,interviewer")</p>}
          </div>

          {book && book.sheetNames.length > 1 && (
            <div>
              <label className={label}>Sheet</label>
              <select value={sheet} onChange={changed(e => setSheet(e.target.value))} className={input}>
                {book.sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          {isCandidates && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Ban</label>
                <select value={department} onChange={changed(e => setDepartment(e.target.value))} className={input}>
                  {departments.map(d => <option key={d.code} value={d.code}>{d.shortName}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Cột mã ứng viên</label>
                <select value={codeColumn} onChange={changed(e => setCodeColumn(e.target.value))} className={input} disabled={!columns.length}>
                  {(columns.length ? columns : [codeLabel]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={removeMissing} onChange={changed(e => setRemoveMissing(e.target.checked))} />
            {isCandidates ? 'Xoá ứng viên của ban này không có trong file' : 'Xoá người không có trong file'}
          </label>

          {book && <p className="text-sm text-slate-500">{fileName}: {rows.length} dòng</p>}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-medium">{error}</div>}

          {preview && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2">
              <div className="flex flex-wrap gap-4 font-bold">
                <span className="text-green-700">Mới: {preview.create}</span>
                <span className="text-blue-700">Cập nhật: {preview.update}</span>
                <span className="text-slate-600">Không đổi: {preview.unchanged}</span>
                <span className="text-amber-700">Bỏ qua: {preview.skipped.length}</span>
                <span className="text-red-700">Sẽ xoá: {preview.remove.length}</span>
              </div>
              {preview.skipped.length > 0 && (
                <ul className="text-amber-800 max-h-32 overflow-y-auto">
                  {preview.skipped.map((s, i) => <li key={i}>Dòng {s.line}: {s.reason}</li>)}
                </ul>
              )}
              {preview.remove.length > 0 && (
                <p className="text-red-700 break-words">Sẽ xoá: {preview.remove.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={close} className="px-5 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-100">Huỷ</button>
          <button onClick={() => send(true)} disabled={!rows.length || busy} className="px-5 py-2 rounded-xl font-bold bg-slate-700 text-white disabled:opacity-40">Xem trước</button>
          <button onClick={() => send(false)} disabled={!preview || busy} className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40">
            <Upload size={16} /> Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
