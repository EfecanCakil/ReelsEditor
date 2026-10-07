import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { FORMATS } from '../../shared/geom.mjs';
import { getRecent, forgetRecent, openProject, startNewProject, restoreAutosave } from '../projectActions.js';
import Icon from './Icon.jsx';

const FORMAT_CARDS = [
  ['9:16', 'Reels · TikTok · Shorts', 'Dikey kısa videolar'],
  ['4:5', 'Instagram gönderi', 'Akışta daha çok yer kaplar'],
  ['1:1', 'Kare', 'Her platformda güvenli'],
  ['16:9', 'YouTube', 'Klasik yatay video'],
];

const STEPS = [
  ['upload', 'Ekle', 'Video ve fotoğraflarını sürükleyip bırak.'],
  ['scissors', 'Kes ve düzenle', 'İstediğin yerden böl, sırala, hız ve geçiş ekle.'],
  ['captions', 'Altyazı ve çeviri', 'Konuşma otomatik yazıya dökülür, istersen çevrilir.'],
  ['download', 'Kaydet', 'Tek video ya da parça parça MP4 olarak dışa aktar.'],
];

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} gün önce` : new Date(ts).toLocaleDateString('tr-TR');
}

export default function Home() {
  const [recent, setRecent] = useState(getRecent);
  const [exists, setExists] = useState({});
  const [recovery, setRecovery] = useState(null);

  useEffect(() => {
    api.recovery().then((r) => r?.data?.clips?.length && setRecovery(r));
  }, []);

  useEffect(() => {
    if (!recent.length) return;
    api.exists(recent.map((r) => r.path)).then((ok) => setExists(Object.fromEntries(recent.map((r, i) => [r.path, ok[i]]))));
  }, [recent]);

  const remove = (e, path) => {
    e.stopPropagation();
    forgetRecent(path);
    setRecent(getRecent());
  };

  return (
    <div className="home">
      <div className="home-bg">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>

      <header className="home-head">
        <div className="brand big">
          <span className="logo">
            <Icon name="play" size={14} />
          </span>
          Reels Editor
        </div>
        <button className="ghost" onClick={() => openProject()}>
          <Icon name="folder" /> Proje aç
        </button>
      </header>

      <main className="home-main">
        {recovery && (
          <div className="recovery">
            <Icon name="info" size={18} />
            <div>
              <b>Kaydedilmemiş bir çalışman bulundu</b>
              <span>
                {recovery.projectPath ? recovery.projectPath.split(/[\\/]/).pop() : 'Adsız proje'} · {recovery.data.clips.length} parça ·{' '}
                {timeAgo(recovery.savedAt)}
              </span>
            </div>
            <button className="primary" onClick={() => restoreAutosave(recovery)}>
              Geri yükle
            </button>
            <button onClick={() => (api.clearAutosave(), setRecovery(null))}>Sil</button>
          </div>
        )}
        <section className="hero">
          <h1>
            Videolarını dakikalar içinde <span className="grad">paylaşıma hazır</span> hale getir
          </h1>
          <p>Kes, birleştir, otomatik altyazı ekle, çevir ve MP4 olarak kaydet. Her şey bilgisayarında çalışır.</p>
        </section>

        <section>
          <h2 className="home-h2">
            <Icon name="plus" /> Yeni proje — format seç
          </h2>
          <div className="format-cards">
            {FORMAT_CARDS.map(([k, title, desc], i) => {
              const f = FORMATS[k];
              const scale = 64 / Math.max(f.w, f.h);
              return (
                <button key={k} className="format-card" style={{ animationDelay: `${0.05 * i}s` }} onClick={() => startNewProject(k)}>
                  <div className="fc-shape">
                    <div style={{ width: f.w * scale, height: f.h * scale }}>
                      <Icon name="play" size={14} />
                    </div>
                  </div>
                  <div className="fc-ratio">{k}</div>
                  <div className="fc-title">{title}</div>
                  <div className="fc-desc">{desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="home-grid">
          <section>
            <h2 className="home-h2">
              <Icon name="clock" /> Son projeler
            </h2>
            {recent.length ? (
              <ul className="recent">
                {recent.map((r) => {
                  const missing = exists[r.path] === false;
                  return (
                    <li key={r.path} className={missing ? 'missing' : ''} onClick={() => !missing && openProject(r.path)} title={r.path}>
                      <div className="rc-thumb">{r.thumb ? <img src={r.thumb} alt="" /> : <Icon name="film" size={20} />}</div>
                      <div className="rc-info">
                        <div className="rc-name">{r.name}</div>
                        <div className="rc-meta">
                          {missing ? 'Dosya bulunamadı' : `${r.format} · ${r.clips} parça · ${timeAgo(r.savedAt)}`}
                        </div>
                      </div>
                      <button className="icon-btn" title="Listeden kaldır" onClick={(e) => remove(e, r.path)}>
                        <Icon name="x" size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="recent-empty">
                Henüz kaydedilmiş proje yok. Bir format seçerek başla; projeni kaydettiğinde burada görünür.
              </div>
            )}
          </section>

          <section>
            <h2 className="home-h2">
              <Icon name="info" /> Nasıl çalışır?
            </h2>
            <ol className="steps">
              {STEPS.map(([icon, title, desc], i) => (
                <li key={title}>
                  <span className="step-ic">
                    <Icon name={icon} size={18} />
                    <b>{i + 1}</b>
                  </span>
                  <div>
                    <div className="step-title">{title}</div>
                    <div className="step-desc">{desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
