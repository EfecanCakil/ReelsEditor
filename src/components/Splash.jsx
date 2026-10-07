import { useEffect, useState } from 'react';

// Açılış animasyonu: logo belirir, yazı harf harf gelir, sonra ekran yumuşakça kaybolur. Tıklayınca geçilir.
export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1900);
    const t2 = setTimeout(onDone, 2400);
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, [onDone]);
  const title = 'Reels Editor';
  return (
    <div className={`splash${leaving ? ' leaving' : ''}`} onClick={() => (setLeaving(true), setTimeout(onDone, 300))}>
      <div className="splash-glow" />
      <div className="splash-logo">
        <div className="ring" />
        <div className="ring" />
        <svg viewBox="0 0 64 64" width="64" height="64">
          <rect x="18" y="10" width="28" height="44" rx="6" fill="none" stroke="#fff" strokeWidth="3.5" />
          <path d="M28 24 L40 32 L28 40 Z" fill="#fff" />
        </svg>
      </div>
      <h1 className="splash-title">
        {[...title].map((ch, i) => (
          <span key={i} style={{ animationDelay: `${0.35 + i * 0.045}s` }}>
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </h1>
      <p className="splash-tag">Kes · Düzenle · Altyazı ekle · Paylaş</p>
      <div className="splash-bar">
        <div />
      </div>
    </div>
  );
}
