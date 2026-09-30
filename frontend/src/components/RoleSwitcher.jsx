import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RefreshCw, Hash, ChevronDown } from 'lucide-react';
import { switchRole, ROLE_LABELS } from '../lib/switchRole';

// Menu of the other roles granted to the logged-in staff member. Interviewer asks for room and table first.
export default function RoleSwitcher() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const others = (user.roles || []).filter(r => r !== user.role && ROLE_LABELS[r]);
  const [open, setOpen] = useState(false);
  const [askSeat, setAskSeat] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [busy, setBusy] = useState(false);

  if (!others.length) return null;

  const go = async (role, seat) => {
    setBusy(true);
    const r = await switchRole(role, seat);
    setBusy(false);
    if (!r.ok) return toast.error('Không đổi được vai trò: ' + r.message);
    setAskSeat(false);
    navigate(r.path);
  };

  const pick = role => {
    setOpen(false);
    if (role === 'interviewer') {
      setRoomNumber(localStorage.getItem('lastRoomNumber') || user.roomNumber || '');
      setTableNumber(localStorage.getItem('lastTableNumber') || user.tableNumber || '');
      setAskSeat(true);
    } else {
      go(role);
    }
  };

  const seatInput = 'w-full pl-11 border-2 border-slate-200 rounded-2xl px-4 py-3.5 bg-white/50 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800';

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 text-white">
        <RefreshCw size={16} /> Đổi vai trò <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
          {others.map(r => (
            <button key={r} onClick={() => pick(r)} className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100">
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}

      {askSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <form
            onSubmit={e => { e.preventDefault(); go('interviewer', { roomNumber: roomNumber.trim(), tableNumber: tableNumber.trim() }); }}
            className="bg-white/90 backdrop-blur-xl rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col p-8 border border-white/50 animate-fade-in-up"
          >
            <h3 className="text-xl font-black text-slate-800 tracking-tight mb-4 text-center">Chuyển sang Người Phỏng Vấn</h3>
            <div className="space-y-4 mb-8">
              {[['Số phòng (VD: 1, 2...)', roomNumber, setRoomNumber], ['Số bàn (VD: 1, 2...)', tableNumber, setTableNumber]].map(([ph, val, set], i) => (
                <div key={ph} className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Hash size={20} />
                  </div>
                  <input type="text" required autoFocus={i === 0} placeholder={ph} value={val} onChange={e => set(e.target.value)} className={seatInput} />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setAskSeat(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-xl transition-colors">Hủy</button>
              <button type="submit" disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all">Xác nhận</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
