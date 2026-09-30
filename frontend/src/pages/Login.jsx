import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { UserCircle, LogIn, ArrowRight, UserCheck, LayoutDashboard, Hash, Monitor, User, CheckCircle2 } from 'lucide-react';
import MacBackground from '../components/MacBackground';
import { switchRole, ROLE_LABELS } from '../lib/switchRole';
import { useOrgConfig } from '../orgConfig';

// Fixed positions for the floating decoration images listed in org config `branding.decorations`
const DECORATION_SLOTS = [
  'top-[10%] left-[10%] w-24 md:w-32 opacity-80 animate-float-slow',
  'top-[15%] right-[15%] w-20 md:w-28 opacity-80 animate-float-fast',
  'bottom-[20%] left-[5%] w-24 md:w-32 opacity-90 animate-float-reverse',
  'top-[40%] left-[8%] w-12 md:w-16 opacity-70 animate-float-fast',
  'top-[30%] right-[8%] w-16 md:w-20 opacity-80 animate-float-slow',
  'bottom-[30%] right-[10%] w-14 md:w-18 opacity-75 animate-float-reverse',
  'bottom-[10%] left-[20%] w-16 md:w-20 opacity-80 animate-float-slow',
  'bottom-[15%] right-[25%] w-16 md:w-24 opacity-85 animate-float-fast',
  'top-[50%] left-[3%] w-12 md:w-16 opacity-90 animate-float-slow',
  'top-[60%] right-[4%] w-12 md:w-16 opacity-80 animate-float-reverse',
  'top-[20%] left-[25%] w-12 opacity-60 animate-float-fast',
  'top-[75%] left-[15%] w-14 opacity-75 animate-float-slow',
];

export default function Login() {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [tempUser, setTempUser] = useState(null);
  const [pickedRole, setPickedRole] = useState('');
  const navigate = useNavigate();
  const { config, departments, codeLabel, deptName, deptShortName, getCandidateName } = useOrgConfig();
  const decorations = (config.branding.decorations || []).slice(0, DECORATION_SLOTS.length);
  const titleDepartments = departments.filter(d => d.titleImage);

  
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.role && user.role !== 'candidate_completed') {
      navigate(`/${user.role}`);
    }
  }, [navigate]);
  
  // Staff login in the role the server returned
  const finishStaffLogin = (data) => {
    if (data.role === 'interviewer') {
      if (data.tableNumber && data.roomNumber) {
        localStorage.setItem('user', JSON.stringify({ 
          username: data.username, 
          fullName: data.fullName,
          role: data.role, 
          department: data.department,
          tableNumber: data.tableNumber,
          roomNumber: data.roomNumber,
          autoAssign: data.autoAssign,
          roles: data.roles,
          token: data.token 
        }));
        navigate('/interviewer');
      } else {
        setTempUser(data);
        setStep(2); // Ask for Table & Room Number
      }
    } else if (data.role === 'receptionist' || (data.roles && data.roles.includes('receptionist') && !data.roles.includes('admin'))) {
      localStorage.setItem('user', JSON.stringify({ username: data.username, fullName: data.fullName, role: 'receptionist', department: data.department, roles: data.roles, token: data.token }));
      navigate('/receptionist');
    } else {
      // Admin
      localStorage.setItem('user', JSON.stringify({ username: data.username, fullName: data.fullName, role: 'admin', department: data.department, roles: data.roles, token: data.token }));
      navigate('/admin');
    }
  };

  // Keep the just-received token (switch-role needs it), in the role the server logged us in as
  const storeStaff = (data) => {
    localStorage.setItem('user', JSON.stringify({ username: data.username, fullName: data.fullName, role: data.role, department: data.department, roles: data.roles, tableNumber: data.tableNumber, roomNumber: data.roomNumber, autoAssign: data.autoAssign, token: data.token }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // Step 1 or 1.2: Verify Code and Password
    if (step === 1 || step === 1.2) {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), password })
      });
      const data = await res.json();
      
      if (data.success) {
        if (data.requirePassword) {
          setStep(1.2);
        } else if (data.requireDepartment) {
          setTempUser({ code: code.trim(), departments: data.departments });
          setStep(1.5);
        } else if (data.role === 'candidate_completed') {
          setTempUser({ role: 'candidate_completed', message: data.message });
          setStep(1.8); // New step for completed message
        } else if (data.role === 'candidate') {
          setTempUser(data);
          setStep(1.75); // Confirmation screen
        } else if (data.roles?.length >= 2) {
          setTempUser(data);
          setPickedRole(data.role);
          setStep(1.9); // Pick which role to enter with
        } else {
          finishStaffLogin(data);
        }
      } else {
        toast.error(data.message || "Không tìm thấy Mã số này. Vui lòng kiểm tra lại!");
      }
    } 
    // Step 1.5: Select Department for Candidate applying to both
    else if (step === 1.5) {
      if (!selectedDepartment) return toast.error("Vui lòng chọn Ban!");
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: tempUser.code, department: selectedDepartment })
      });
      const data = await res.json();
      if (data.success && data.role === 'candidate') {
        setTempUser(data);
        setStep(1.75);
      } else {
        toast.error(data.message || "Đăng nhập thất bại!");
      }
    }
    // Step 1.75: Confirm Candidate Info
    else if (step === 1.75) {
      localStorage.setItem('user', JSON.stringify({ interviewCode: tempUser.interviewCode, role: 'candidate', department: tempUser.department, token: tempUser.token }));
      navigate('/candidate');
    }
    // Step 1.9: Staff with several roles picks one
    else if (step === 1.9) {
      if (pickedRole === tempUser.role) return finishStaffLogin(tempUser);
      if (pickedRole === 'interviewer') {
        setRoomNumber(localStorage.getItem('lastRoomNumber') || '');
        setTableNumber(localStorage.getItem('lastTableNumber') || '');
        setStep(2);
        return;
      }
      storeStaff(tempUser);
      const r = await switchRole(pickedRole);
      if (r.ok) navigate(r.path);
      else toast.error('Không đổi được vai trò: ' + r.message);
    }
    // Step 2: Set Table & Room Number for Interviewer
    else if (step === 2) {
      if (!tableNumber.trim() || !roomNumber.trim()) {
        toast.error("Vui lòng nhập cả số phòng và số bàn!");
        return;
      }
      // Logged in as another role and picked interviewer at step 1.9
      if (tempUser && tempUser.role !== 'interviewer') {
        storeStaff(tempUser);
        const r = await switchRole('interviewer', { roomNumber: roomNumber.trim(), tableNumber: tableNumber.trim() });
        if (r.ok) navigate(r.path);
        else toast.error('Không đổi được vai trò: ' + r.message);
        return;
      }
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), password: password, roomNumber: roomNumber.trim(), tableNumber: tableNumber.trim() })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('user', JSON.stringify({ 
          username: data.username, 
          fullName: data.fullName,
          role: data.role, 
          department: data.department,
          roles: data.roles,
          roomNumber: data.roomNumber,
          tableNumber: data.tableNumber,
          autoAssign: data.autoAssign,
          token: data.token
        }));
        navigate('/interviewer');
      } else {
        toast.error(data.message || "Lỗi khi xác nhận bàn!");
      }
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center bg-slate-50 p-4 font-sans relative overflow-x-hidden overflow-y-auto py-4">
      <MacBackground />

      {/* Floating decorations */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {decorations.map((src, i) => (
          <img key={src} src={src} alt="" className={`absolute ${DECORATION_SLOTS[i]}`} />
        ))}
      </div>

      {/* Department title images */}
      {titleDepartments.length > 0 && (
        <div className="z-10 flex flex-row items-center justify-center gap-2 md:gap-8 mb-4 md:mb-6 w-full px-4 max-w-2xl">
          {titleDepartments.map((d, i) => (
            <React.Fragment key={d.code}>
              {i > 0 && <span className="text-3xl md:text-7xl font-black text-white/70 drop-shadow-md animate-fade-in">&amp;</span>}
              <img src={d.titleImage} alt={d.name} className="flex-1 min-w-0 max-w-[24rem] lg:max-w-[32rem] max-h-[28vh] object-contain drop-shadow-2xl transform animate-fade-in-up" />
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="bg-white/90 backdrop-blur-2xl p-8 md:p-10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.1)] w-full max-w-md border border-white z-10 animate-fade-in-up">
        
        <form onSubmit={handleLogin} className="space-y-5">
          {step === 1 && (
            <div className="space-y-1 animate-fade-in">
              <label className="block text-sm font-bold text-slate-700 ml-1">
                {codeLabel} (Ứng viên) / Mã nhân sự <span className="text-blue-500">*</span>
              </label>
              <div className="relative group animate-fade-in-up animation-delay-200">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <User size={20} />
              </div>
              <input 
                type="text" 
                required 
                placeholder={`Nhập ${codeLabel} (Ứng viên) hoặc Mã nhân sự`} 
                value={code} 
                onChange={(e) => setCode(e.target.value)}
                className="w-full pl-11 border-2 border-slate-200 rounded-2xl px-4 py-3.5 bg-white/50 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
              />
            </div>
            </div>
          )}

          {step === 1.2 && (
            <div className="space-y-4 animate-fade-in">
              <label className="block text-sm font-bold text-slate-700 ml-1">
                Nhập mật khẩu nhân sự: <span className="text-blue-500">*</span>
              </label>
              <div className="relative group animate-fade-in-up animation-delay-200">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <span className="font-bold">**</span>
                </div>
                <input 
                  type="password" 
                  required 
                  placeholder="Mật khẩu" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 border-2 border-slate-200 rounded-2xl px-4 py-3.5 bg-white/50 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
                />
              </div>
              <button type="button" onClick={() => {setStep(1); setPassword('');}} className="text-sm font-semibold text-blue-500 hover:text-blue-700 mt-2 block ml-1">&larr; Quay lại</button>
            </div>
          )}

          {step === 1.5 && (
            <div className="space-y-4 animate-fade-in">
              <label className="block text-sm font-bold text-slate-700 ml-1">
                Bạn đã đăng ký nhiều Ban. Vui lòng chọn Ban muốn phỏng vấn lúc này: <span className="text-blue-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {tempUser?.departments?.map(dep => (
                  <button 
                    type="button" 
                    key={dep}
                    onClick={() => setSelectedDepartment(dep)}
                    className={`py-3 rounded-xl font-bold border-2 transition-all ${selectedDepartment === dep ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}
                  >
                    {deptShortName(dep)}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(1)} className="text-sm font-semibold text-blue-500 hover:text-blue-700 mt-2 block ml-1">&larr; Quay lại</button>
            </div>
          )}

          {step === 1.75 && tempUser && (
            <div className="space-y-4 animate-fade-in text-center">
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <User size={40} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-slate-800">Xác nhận thông tin</h2>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-3">
                <p className="text-sm"><span className="text-slate-500 font-semibold">{codeLabel}:</span> <span className="font-bold text-slate-800 text-lg ml-2">{tempUser.interviewCode}</span></p>
                <p className="text-sm"><span className="text-slate-500 font-semibold">Họ và tên:</span> <span className="font-bold text-slate-800 text-lg ml-2">{getCandidateName(tempUser) || 'Không có dữ liệu'}</span></p>
                <p className="text-sm"><span className="text-slate-500 font-semibold">Ban ứng tuyển:</span> <span className="font-bold text-slate-800 text-lg ml-2">{deptName(tempUser.department)}</span></p>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setStep(1)} className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
                  Nhập lại
                </button>
                <button type="submit" className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 transition-all">
                  Xác nhận
                </button>
              </div>
            </div>
          )}

          {step === 1.9 && tempUser && (
            <div className="space-y-4 animate-fade-in">
              <label className="block text-sm font-bold text-slate-700 ml-1">
                Xin chào {tempUser.fullName || tempUser.username}, bạn muốn vào với vai trò nào?
              </label>
              <div className="space-y-2">
                {tempUser.roles.filter(r => ROLE_LABELS[r]).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPickedRole(r)}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 font-bold transition-all ${pickedRole === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white/50 text-slate-700 hover:border-blue-300'}`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(1)} className="text-sm font-semibold text-blue-500 hover:text-blue-700 mt-2 block ml-1">
                &larr; Quay lại
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 ml-1">
                  Xin chào {tempUser?.fullName || tempUser?.username}, bạn phụ trách phòng số mấy? <span className="text-blue-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Hash size={20} />
                  </div>
                  <input 
                    type="text" 
                    required
                    placeholder="VD: 1, 2, 3..." 
                    value={roomNumber} 
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="w-full pl-11 border-2 border-slate-200 rounded-2xl px-4 py-3.5 bg-white/50 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-bold text-slate-700 ml-1">
                  Và bàn số mấy? <span className="text-blue-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Monitor size={20} />
                  </div>
                  <input 
                    type="text" 
                    required
                    placeholder="VD: 1, 2..." 
                    value={tableNumber} 
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full pl-11 border-2 border-slate-200 rounded-2xl px-4 py-3.5 bg-white/50 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setStep(1)} 
                className="text-sm font-semibold text-blue-500 hover:text-blue-700 mt-2 block ml-1"
              >
                &larr; Quay lại
              </button>
            </div>
          )}

          {step === 1.8 && (
            <div className="space-y-4 animate-fade-in text-center py-6">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <CheckCircle2 size={50} strokeWidth={2.5} />
              </div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">HOÀN TẤT</h2>
              <p className="text-slate-500 font-medium text-lg leading-relaxed mt-2">
                {tempUser?.message || 'Cảm ơn bạn đã tham gia phỏng vấn.'}
              </p>
              <p className="text-slate-400 mt-4 italic">Bây giờ bạn có thể ra về.</p>
            </div>
          )}
          
          {step !== 1.75 && step !== 1.8 && (
            <button type="submit" className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 mt-8 rounded-2xl font-black text-lg shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all">
              <LogIn size={20} /> {step === 1 ? 'TIẾP TỤC' : step === 1.2 ? 'ĐĂNG NHẬP' : step === 1.5 ? 'XÁC NHẬN VÀO PHÒNG CHỜ' : step === 1.9 ? 'VÀO' : 'XÁC NHẬN VÀO BÀN'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
