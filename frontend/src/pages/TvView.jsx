import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { Volume2, VolumeX, Monitor, BellRing } from "lucide-react";
import MacBackground from "../components/MacBackground";
import { useOrgConfig } from "../orgConfig";

export default function TvView() {
  const [boardData, setBoardData] = useState({ waiting: [], moving: [], interviewing: [] });
  const socketRef = useRef(null);
  const { config, departments, codeLabel, deptTheme, inDepartment, getCandidateName } = useOrgConfig();

  useEffect(() => {
    fetchBoard();
    const interval = setInterval(fetchBoard, 3000);
    
    socketRef.current = io("/");
    socketRef.current.on("board_update", fetchBoard);

    return () => {
      clearInterval(interval);
      socketRef.current.disconnect();
    };
  }, []);

  const fetchBoard = async () => {
    try {
      // Fetch all departments together so both columns show correctly
      const res = await fetch(`/api/tv-board`);
      const data = await res.json();
      setBoardData({
        waiting: data.waiting || [],
        moving: data.moving || [],
        interviewing: data.interviewing || [],
        completed: data.completed || []
      });
    } catch (err) {
      console.error(err);
    }
  };

  const getName = (c) => getCandidateName(c) || 'Ứng viên';

  const renderCandidateRow = (c, colorTheme) => (
    <div key={c.interviewCode} className={`w-full bg-white/10 border border-white/20 p-3 rounded-2xl flex flex-col xl:flex-row items-center justify-between gap-3 transform hover:scale-[1.02] transition-transform animate-fade-in-up shrink-0`}>
      <div className="flex-1 text-left pl-2">
        <div className={`${colorTheme.textMuted} font-bold text-sm uppercase tracking-widest mb-0.5`}>{codeLabel}: {c.interviewCode}</div>
        <div className="text-2xl xl:text-3xl font-black text-white tracking-tight drop-shadow-md leading-tight">
          {getName(c)}
        </div>
      </div>
      
      <div className={`${colorTheme.bgSolid} rounded-xl p-3 text-center min-w-[120px] shadow-lg border border-white/20 flex flex-col justify-center`}>
        {c.assignedRoom && <div className={`${colorTheme.textMuted} font-bold text-xs uppercase tracking-widest mb-1 bg-black/20 rounded-md py-0.5`}>PHÒNG {c.assignedRoom}</div>}
        <div className="text-white/80 font-black text-sm uppercase tracking-widest mb-0.5">BÀN SỐ</div>
        <div className="text-4xl font-black text-white leading-none">{c.assignedTable}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-900 font-sans flex flex-col items-center">
      <MacBackground />

      {config.branding.qrImage && <div className="w-full flex justify-center py-6 z-20 bg-slate-900/80 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-10 bg-white p-6 rounded-[2.5rem] shadow-[0_0_50px_rgba(255,255,255,0.2)]">
          <div className="text-center pr-10 border-r-2 border-slate-200">
            <h1 className="text-5xl font-black text-slate-800 uppercase tracking-widest mb-2">Quét mã QR</h1>
            <p className="text-slate-500 font-bold text-xl">để xem thứ tự của bạn</p>
          </div>
          <img src={config.branding.qrImage} alt="QR Code" className="w-56 h-56 rounded-3xl object-contain border-4 border-slate-100 shadow-inner" />
        </div>
      </div>}

      <div
        className="flex-1 w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:[grid-template-columns:var(--tv-cols)] gap-6 z-10 h-[calc(100vh-200px)] overflow-hidden"
        style={{ '--tv-cols': `repeat(${departments.length}, minmax(0, 1fr))` }}
      >
        {departments.map(dept => {
          const theme = deptTheme(dept.code);
          const moving = boardData.moving.filter(c => inDepartment(c, dept.code));
          const allWaiting = boardData.waiting.filter(c => inDepartment(c, dept.code));
          const waiting = allWaiting.slice(0, 8);
          return (
            <div key={dept.code} className={`flex flex-col bg-gradient-to-br ${theme.panel} backdrop-blur-2xl rounded-[3rem] border p-6 overflow-hidden`}>
              {/* 1. Title */}
              <div className="h-[15%] flex justify-center items-center shrink-0 mb-0">
                {dept.titleImage ? (
                  <img src={dept.titleImage} alt={dept.name} style={{ transform: `scale(${dept.tvTitleScale || 1})` }} className="w-full h-full object-contain drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] pointer-events-none origin-center" />
                ) : (
                  <h2 className="text-4xl font-black text-white uppercase tracking-widest text-center drop-shadow-md">{dept.name}</h2>
                )}
              </div>

              {/* 2. Moving */}
              <div className={`h-[35%] flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 border-t ${theme.divider} pt-2 shrink-0`}>
                <h3 className={`text-lg font-bold ${theme.heading} uppercase tracking-widest shrink-0`}>Đang Gọi:</h3>
                {moving.length === 0 ? (
                  <p className={`${theme.empty} italic text-center py-2`}>Chưa gọi thêm</p>
                ) : moving.map(c => renderCandidateRow(c, { bgSolid: theme.solid, textMuted: theme.muted }))}
              </div>

              {/* 3. Waiting */}
              <div className="h-[50%] bg-slate-900/40 rounded-3xl p-4 flex flex-col overflow-hidden mt-2">
                <h3 className="text-base font-bold text-slate-300 uppercase tracking-widest mb-3 shrink-0">Sắp Đến Lượt ({allWaiting.length})</h3>
                {waiting.length === 0 ? <p className="text-slate-500 italic">Trống</p> : (
                  <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar flex-1 pr-2">
                    {waiting.map((c, index) => (
                      <div key={c.interviewCode} className={`${theme.chip} px-4 py-2.5 rounded-xl border flex justify-between items-center shadow-sm shrink-0`}>
                        <div className="flex items-center gap-4">
                          <span className={`text-2xl font-black ${theme.chipIndex} w-10 text-center drop-shadow-md`}>#{index + 1}</span>
                          <div className="flex flex-col">
                            <span className="text-xl font-black tracking-tight drop-shadow-sm leading-tight">{getName(c)}</span>
                            <span className={`${theme.chipSub} font-bold text-xs uppercase tracking-widest`}>{codeLabel}: {c.interviewCode}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
