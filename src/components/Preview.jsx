import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { player } from '../player.js';
import { fmtTime, totalDur } from '../timeline.js';
import { FORMATS } from '../../shared/geom.mjs';
import { drag } from '../drag.js';
import { importMedia } from './MediaPanel.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { buildJob } from '../exportJob.js';
import { colorFilterId } from '../render.js';
import { isIdentity, svgMatrixValues } from '../../shared/color.mjs';

// Parçaların renk ayarları için SVG filtreleri (canvas `filter: url(#…)` ile kullanır)
function ColorDefs({ clips }) {
  const list = clips.filter((c) => !isIdentity(c.color));
  // Filtreler DOM'a eklendikten sonra kareyi yeniden çizdir
  useEffect(() => void (player.colorDefsVersion = (player.colorDefsVersion || 0) + 1));
  return (
    <svg className="hidden-media" width="0" height="0" aria-hidden="true">
      <defs>
        {list.map((c) => (
          <filter key={colorFilterId(c)} id={colorFilterId(c)} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={svgMatrixValues(c.color)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

// Oynatma çubuğundaki kareyi tam çözünürlükte PNG olarak kaydet (kapak fotoğrafı için)
async function saveFrame() {
  const s = useStore.getState();
  player.pause();
  const base = s.projectPath ? s.projectPath.split(/[\\/]/).pop().replace(/\.reels\.json$|\.json$/i, '') : 'reels';
  const out = await api.pickImage(`${base}-kapak.png`);
  if (!out) return;
  s.notify('Kare hazırlanıyor…');
  const job = await buildJob(s.project, { still: s.time }, out);
  player.suspend(true);
  const r = await api.exportStart(job).finally(() => player.suspend(false));
  if (r.ok) s.notify('Kare kaydedildi');
  else s.notify(`Kare kaydedilemedi: ${r.error}`, 'error');
}

export default function Preview() {
  const vRef = useRef(null);
  const v2Ref = useRef(null);
  const aRef = useRef(null);
  const cRef = useRef(null);
  const format = useStore((s) => s.project.format);
  const clips = useStore((s) => s.project.clips);
  const media = useStore((s) => s.project.media);
  const playing = useStore((s) => s.playing);
  const time = useStore((s) => s.time);
  const total = totalDur(clips);
  const F = FORMATS[format];

  useEffect(() => {
    player.attach([vRef.current, v2Ref.current], aRef.current, cRef.current);
    return () => player.detach();
  }, []);

  // Durdurulmuşken kırpma/sıralama değişirse doğru kareyi göster
  useEffect(() => {
    if (!useStore.getState().playing) player.seek(useStore.getState().time);
  }, [clips, media]);

  // Önizlemede metni sürükleyerek konumlandırma
  const onPointerDown = (e) => {
    const rect = cRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * F.w;
    const py = ((e.clientY - rect.top) / rect.height) * F.h;
    const hit = [...player.boxes].reverse().find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    const s = useStore.getState();
    if (!hit) return player.toggle();
    s.select({ type: hit.type, id: hit.id }, hit.type === 'text' ? 'text' : 'subs');
    const style =
      hit.type === 'text' ? s.project.texts.find((t) => t.id === hit.id).style : hit.type === 'tr' ? s.project.trStyle : s.project.subStyle;
    const ox = style.x;
    const oy = style.y;
    const key = `move-${Date.now()}`;
    drag(e, (dx, dy) => {
      const x = Math.min(1, Math.max(0, ox + dx / rect.width));
      const y = Math.min(1, Math.max(0, oy + dy / rect.height));
      if (hit.type === 'text') s.updateText(hit.id, { style: { x, y } }, key);
      else if (hit.type === 'tr') s.updateTrStyle({ x, y }, key);
      else s.updateSubStyle({ x, y }, key);
    });
  };

  return (
    <section className="preview">
      <div className="stage">
        <canvas
          ref={cRef}
          onPointerDown={onPointerDown}
          style={{ aspectRatio: `${F.w} / ${F.h}`, visibility: clips.length ? 'visible' : 'hidden' }}
          title="Tıkla: oynat/duraklat · Metni sürükleyerek taşı"
        />
        {!clips.length && (
          <button className="dropzone" onClick={importMedia}>
            <span className="dz-icon">
              <Icon name="upload" size={30} />
            </span>
            <b>Videolarını veya fotoğraflarını buraya sürükle</b>
            <span>ya da tıklayıp seç</span>
            <small>MP4 · MOV · WebM · JPG · PNG — müzik için MP3 / WAV</small>
          </button>
        )}
      </div>
      <div className="transport">
        <button className="icon-btn" onClick={() => player.seek(0)} title="Başa dön (Home)" disabled={!total}>
          <Icon name="back" />
        </button>
        <button className="play" onClick={() => player.toggle()} title="Oynat / Duraklat (Boşluk)" disabled={!total}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <button className="icon-btn" onClick={() => player.seek(total)} title="Sona git (End)" disabled={!total}>
          <Icon name="fwd" />
        </button>
        <span className="tc">
          {fmtTime(time)} <i>/ {fmtTime(total)}</i>
        </span>
        <button className="icon-btn snap" onClick={saveFrame} disabled={!total} title="Bu kareyi resim olarak kaydet (kapak fotoğrafı için)">
          <Icon name="image" /> Kareyi kaydet
        </button>
      </div>
      <ColorDefs clips={clips} />
      <video ref={vRef} className="hidden-media" playsInline preload="auto" />
      <video ref={v2Ref} className="hidden-media" playsInline preload="auto" />
      <audio ref={aRef} className="hidden-media" loop preload="auto" />
    </section>
  );
}
