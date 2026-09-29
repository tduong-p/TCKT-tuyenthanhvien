import React from 'react';
import { useOrgConfig } from '../orgConfig';

export default function Footer() {
  const { config } = useOrgConfig();
  const footer = config.footer;
  if (!footer) return null;
  const logos = footer.logos || [];
  const credits = footer.credits || [];

  return (
    <footer className="w-full bg-white/60 backdrop-blur-md border-t border-slate-200 py-6 mt-auto shrink-0 z-50 relative">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
        {logos.length > 0 && (
          <div className="flex items-center gap-6">
            {logos.map((logo, i) => (
              <React.Fragment key={logo.src}>
                {i > 0 && <span className="text-xl text-slate-300 font-black tracking-widest">X</span>}
                <a href={logo.href} target="_blank" rel="noopener noreferrer" className="hover:scale-105 transition-transform" title={logo.alt}>
                  <img src={logo.src} alt={logo.alt} className="h-16 w-auto object-contain drop-shadow-sm" />
                </a>
              </React.Fragment>
            ))}
          </div>
        )}
        
        <div className="text-center md:text-left flex-1 max-w-xl">
          {footer.heading && <h3 className="text-lg font-black text-slate-800 tracking-tight mb-2">{footer.heading}</h3>}
          {credits.length > 0 && (
            <p className="text-sm font-medium text-slate-600 leading-relaxed">
              {footer.creditsPrefix}{' '}
              {credits.map((c, i) => (
                <React.Fragment key={c.label}>
                  {i > 0 && (i === credits.length - 1 ? ' và ' : ', ')}
                  {c.href
                    ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">{c.label}</a>
                    : <span className="font-bold">{c.label}</span>}
                </React.Fragment>
              ))}.
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
