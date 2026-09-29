import React from 'react';
import { useOrgConfig } from '../orgConfig';

export default function MacBackground() {
  const { config } = useOrgConfig();
  const bg = config.branding.background;
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-gradient-to-br from-slate-800 via-indigo-900 to-slate-900">
      {bg && <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />}
    </div>
  );
}
