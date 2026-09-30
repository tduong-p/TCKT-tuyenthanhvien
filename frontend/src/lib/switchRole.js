import toast from 'react-hot-toast';

// Switch the logged-in staff member to another granted role and keep the new token.
export const ROLE_PATHS = { admin: '/admin', interviewer: '/interviewer', receptionist: '/receptionist' };
export const ROLE_LABELS = { admin: 'Admin', interviewer: 'Người phỏng vấn', receptionist: 'Lễ tân' };

// Several devices/accounts may share a table: they then see the same candidate
export function warnTableMates(names) {
  if (names && names.length) toast(`Bàn này đã có: ${names.join(', ')}. Các máy ở cùng bàn sẽ dùng chung ứng viên.`, { icon: '👥', duration: 6000 });
}

export async function switchRole(targetRole, { roomNumber, tableNumber } = {}) {
  try {
    const res = await fetch('/api/staff/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRole, roomNumber, tableNumber }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) return { ok: false, message: data.message || `Lỗi ${res.status}` };
    const stored = JSON.parse(localStorage.getItem('user')) || {};
    Object.assign(stored, { token: data.token, role: data.role, roomNumber: data.roomNumber, tableNumber: data.tableNumber });
    localStorage.setItem('user', JSON.stringify(stored));
    if (data.roomNumber) localStorage.setItem('lastRoomNumber', data.roomNumber);
    if (data.tableNumber) localStorage.setItem('lastTableNumber', data.tableNumber);
    warnTableMates(data.tableMates);
    return { ok: true, path: ROLE_PATHS[data.role] };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
