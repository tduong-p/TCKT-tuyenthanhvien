// Switch the logged-in staff member to another granted role and keep the new token.
export const ROLE_PATHS = { admin: '/admin', interviewer: '/interviewer', receptionist: '/receptionist' };
export const ROLE_LABELS = { admin: 'Admin', interviewer: 'Người phỏng vấn', receptionist: 'Lễ tân' };

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
    return { ok: true, path: ROLE_PATHS[data.role] };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
