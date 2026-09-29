import React, { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import { LogOut, CheckCircle2, Clock, MapPin, Handshake } from 'lucide-react';
import MacBackground from '../components/MacBackground';
import MacWindow from '../components/MacWindow';
import { useOrgConfig } from '../orgConfig';

export default function CandidateView() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('active'); // active, waiting, moving, interviewing, completed
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const [assignedTable, setAssignedTable] = useState(null);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const alertIntervalRef = useRef(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [flash, setFlash] = useState(false);
  const [hasAcked, setHasAcked] = useState(false);
  const socketRef = useRef(null);
  const { deptShortName } = useOrgConfig();

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('user'));
    if (stored && stored.role === 'candidate') {
      setUser(stored);
      fetchStatus(stored.interviewCode);
    }
    
    socketRef.current = io('/');
    
    socketRef.current.on('candidate_assigned', (data) => {
      // B2 fix: guard against stored being null
      if (!stored) return;
      if (data.candidate.interviewCode === stored.interviewCode && data.candidate.department === stored.department) {
        setStatus('moving');
        setHasAcked(false);
        setAssignedTable(data.tableNumber);
        setAssignedRoom(data.roomNumber);
        playAlertSound();
        startFlashing();
      }
    });

    socketRef.current.on('board_update', () => {
      if (stored) fetchStatus(stored.interviewCode);
    });

    return () => socketRef.current.disconnect();
  }, []);

  const fetchStatus = async (interviewCode) => {
    const stored = JSON.parse(localStorage.getItem('user'));
    const dept = user?.department || stored?.department;
    const query = dept ? `?department=${dept}` : '';
    const res = await fetch(`/api/board${query}`);
    const data = await res.json();
    
    // Find queue position if in waiting
    const wIndex = data.waiting.findIndex(c => c.interviewCode === interviewCode);
    if (wIndex !== -1) {
      setQueuePosition(wIndex + 1);
    } else {
      setQueuePosition(null);
    }

    const all = [...data.waiting, ...(data.moving || []), ...data.interviewing, ...data.completed];
    const me = all.find(c => c.interviewCode === interviewCode && c.department === dept);
    if (me) {
      if (statusRef.current !== 'completed' && me.status === 'completed') {
        // Just transitioned to completed
        setTimeout(checkNextDepartment, 3000);
      }
      setStatus(me.status);
      setAssignedTable(me.assignedTable);
      setAssignedRoom(me.assignedRoom);
    }
  };

  const checkNextDepartment = async () => {
    const stored = JSON.parse(localStorage.getItem('user'));
    if (!stored) return;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: stored.interviewCode })
    });
    const data = await res.json();
    if (data.success && data.role === 'candidate') {
       localStorage.setItem('user', JSON.stringify({ interviewCode: data.interviewCode, role: 'candidate', department: data.department, token: data.token }));
       setUser({ ...stored, department: data.department });
       setStatus('active');
         setAssignedTable(null);
         setAssignedRoom(null);
       toast.success(`Chuyển sang check-in cho ${deptShortName(data.department)}!`);
    }
  };

  const playAlertSound = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1108.73, ctx.currentTime);
      osc2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.3);
    }, 150);
  };

  const startFlashing = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 8000);
  };

  const handleCheckIn = () => {
    socketRef.current.emit('candidate_checkin', { interviewCode: user.interviewCode, department: user.department });
  };

  const handleAckMoving = () => {
    socketRef.current.emit('candidate_moving_ack', { interviewCode: user.interviewCode });
    setFlash(false);
    setHasAcked(true);
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans">Vui lòng đăng nhập...</div>;

  return (
    <div className={`min-h-screen flex items-center justify-center font-sans transition-all duration-700 ${flash ? 'bg-red-500' : ''}`}>
      {!flash && <MacBackground />}
      
      
        <div className={`relative z-10 w-full max-w-md p-4 transition-all duration-500 ${flash ? 'scale-105' : ''}`}>
          <button 
            onClick={() => { localStorage.removeItem('user'); window.location.href = '/'; }} 
            className="absolute -top-8 right-4 bg-white/30 hover:bg-white text-slate-600 px-4 py-1.5 rounded-full text-sm font-bold shadow-sm backdrop-blur-md transition-all flex items-center gap-2"
          >
            <LogOut size={14} /> Đăng xuất
          </button>
        <MacWindow title="Hồ Sơ Ứng Viên" contentClassName="p-10 text-center">
          <div className="mb-8">
            <div className="inline-block bg-blue-100/80 backdrop-blur-md text-blue-800 font-black px-5 py-2 rounded-full border border-blue-200 shadow-sm text-sm mb-4">
              Mã PV: {user.interviewCode}
            </div>
          </div>
          
          {status === 'active' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-6 text-blue-500"><CheckCircle2 size={64} strokeWidth={1.5} /></div>
              <h2 className="text-3xl font-black mb-3 text-slate-800 tracking-tight">Chào mừng!</h2>
              <p className="mb-8 text-slate-500 font-medium leading-relaxed">Bạn đã có mặt tại khu vực phỏng vấn.<br/>Vui lòng xác nhận Check-in để lấy số thực tế.</p>
              <button onClick={handleCheckIn} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl text-lg font-black w-full hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all">
                XÁC NHẬN CHECK-IN
              </button>
            </div>
          )}

          {status === 'waiting' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4 text-orange-400"><Clock size={48} className="animate-pulse" strokeWidth={1.5} /></div>
              {queuePosition && (
                <div className="mb-4 flex flex-col items-center">
                  <span className="text-slate-500 font-bold uppercase tracking-widest text-sm mb-1">Thứ tự của bạn</span>
                  <div className="text-8xl font-black text-slate-800 drop-shadow-md">
                    {queuePosition}
                  </div>
                </div>
              )}
              <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 mb-4 tracking-tight drop-shadow-sm uppercase">Đang chờ</div>
              <p className="text-slate-500 font-medium leading-relaxed">Bạn đã được xếp vào hàng đợi.<br/>Vui lòng theo dõi màn hình khi đến lượt.</p>
            </div>
          )}

          {status === 'moving' && (
            <div className="animate-bounce-slight">
              <div className="flex justify-center mb-6 text-red-500"><MapPin size={72} className="animate-bounce" strokeWidth={1.5} /></div>
              <div className="text-4xl font-black text-red-600 mb-2 tracking-tight">ĐẾN LƯỢT BẠN!</div>
              <p className="text-slate-600 mb-6 text-lg font-medium">Xin mời di chuyển ngay đến</p>
              <div className="bg-blue-50/80 backdrop-blur-sm border-2 border-blue-200 rounded-2xl py-6 mb-8 shadow-inner">
                {assignedRoom && <span className="block text-2xl text-blue-600 font-black mb-2 uppercase">Phòng {assignedRoom}</span>}
                <span className="block text-lg text-blue-600 font-black mb-1 tracking-widest">BÀN SỐ</span>
                <span className="block text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-blue-600 to-indigo-700 drop-shadow-sm">{assignedTable}</span>
              </div>
              {!hasAcked && (
                <button onClick={handleAckMoving} className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-4 rounded-xl text-lg font-black w-full shadow-lg hover:shadow-green-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all">
                  TÔI ĐÃ NHẬN THÔNG TIN
                </button>
              )}
            </div>
          )}

          {status === 'interviewing' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-6 text-blue-500"><Handshake size={64} strokeWidth={1.5} /></div>
              <div className="text-3xl font-black text-blue-700 mb-4 tracking-tight">ĐANG PHỎNG VẤN</div>
              <p className="text-slate-500 text-lg font-medium leading-relaxed">Chúc bạn tự tin và hoàn thành tốt<br/>buổi phỏng vấn tại Bàn {assignedTable}.</p>
            </div>
          )}

          {status === 'completed' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-6 text-emerald-500"><CheckCircle2 size={64} strokeWidth={1.5} /></div>
              <div className="text-3xl font-black text-emerald-600 mb-4 tracking-tight">HOÀN TẤT</div>
              <p className="text-slate-500 text-lg font-medium leading-relaxed">Buổi phỏng vấn của bạn đã kết thúc.<br/>Cảm ơn bạn đã tham gia. Bạn có thể ra về.</p>
            </div>
          )}
        </MacWindow>
      </div>
    </div>
  );
}
