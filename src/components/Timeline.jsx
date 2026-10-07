import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { player } from '../player.js';
import { layout, fmtTime, speedOf, hasTrans } from '../timeline.js';
import { drag } from '../drag.js';
import Icon from './Icon.jsx';
import Waveform from './Waveform.jsx';
import { cutSilences } from '../silence.js';

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAB_OF = { text: 'text', sub: 'subs', tr: 'subs' };

// Metin / altyazı / çeviri öğesi: gövde sürüklenince kayar, kenarlardan uzatılıp kısaltılır
function TimedItem({ item, type, pps, selected, onUpdate }) {
  const s = useStore.getState();
  const start = (e, mode) => {
    e.stopPropagation();
    s.select({ type, id: item.id }, TAB_OF[type]);
    const o = { start: item.start, end: item.end };
    const key = `${mode}-${item.id}-${Date.now()}`;
    drag(e, (dx) => {
      const d = dx / pps;
      if (mode === 'move') {
        const st = Math.max(0, o.start + d);
        onUpdate(item.id, { start: st, end: st + (o.end - o.start) }, key);
      } else if (mode === 'l') onUpdate(item.id, { start: clamp(o.start + d, 0, o.end - 0.2) }, key);
      else onUpdate(item.id, { end: Math.max(o.start + 0.2, o.end + d) }, key);
    });
  };
  return (
    <div
      className={`item ${type}${selected ? ' sel' : ''}`}
      style={{ left: item.start * pps, width: Math.max(4, (item.end - item.start) * pps) }}
      onPointerDown={(e) => start(e, 'move')}
      title={item.text}
    >
      <div className="handle l" onPointerDown={(e) => start(e, 'l')} />
      <span>{item.text}</span>
      <div className="handle r" onPointerDown={(e) => start(e, 'r')} />
    </div>
  );
}

export default function Timeline() {
  const project = useStore((s) => s.project);
  const time = useStore((s) => s.time);
  const pps = useStore((s) => s.pxPerSec);
  const selection = useStore((s) => s.selection);
  const playing = useStore((s) => s.playing);
  const [ghost, setGhost] = useState(null); // sürüklenerek taşınan parça: { id, dx }
  const scrollRef = useRef(null);
  const s = useStore.getState();

  const L = layout(project.clips);
  const total = L.length ? L.at(-1).end : 0;
  const contentW = Math.max(total + 8, 20) * pps;
  const step = TICK_STEPS.find((t) => t * pps >= 70) || 300;
  const ticks = [];
  for (let t = 0; t * pps <= contentW; t += step) ticks.push(t);
  const translations = project.translations || [];
  const selClip = selection?.type === 'clip' && project.clips.find((c) => c.id === selection.id);

  // Ctrl + tekerlek ile yakınlaştırma
  useEffect(() => {
    const el = scrollRef.current;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const cur = useStore.getState().pxPerSec;
      useStore.setState({ pxPerSec: clamp(cur * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 4, 400) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Oynatırken oynatma çubuğunu görünür tut
  useEffect(() => {
    const el = scrollRef.current;
    if (!playing || !el) return;
    const x = time * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 80;
  }, [time, playing, pps]);

  const [cutting, setCutting] = useState(false);
  const cutAll = async () => {
    if (!confirm('Tüm parçalardaki konuşma boşlukları otomatik kesilsin mi? (Ctrl+Z ile geri alabilirsin)')) return;
    setCutting(true);
    try {
      const r = await cutSilences(project.clips.map((c) => c.id), 'normal');
      s.notify(r.saved > 0.05 ? `${r.cuts} boşluk kesildi, video ${r.saved.toFixed(1)} sn kısaldı.` : 'Kesilecek belirgin bir boşluk bulunamadı.');
    } catch (err) {
      s.notify(`Sessizlik analizi yapılamadı: ${err.message}`, 'error');
    }
    setCutting(false);
  };

  // Videonun tamamı ekrana sığsın
  const fit = () => {
    const w = scrollRef.current?.clientWidth || 800;
    if (total) useStore.setState({ pxPerSec: clamp((w - 40) / total, 4, 400) });
  };

  const xToTime = (clientX) => {
    const el = scrollRef.current;
    return Math.max(0, (clientX - el.getBoundingClientRect().left + el.scrollLeft) / pps);
  };
  const scrub = (e) => {
    if (e.button !== 0) return;
    player.pause();
    player.seek(xToTime(e.clientX));
    drag(e, (_dx, _dy, ev) => player.seek(xToTime(ev.clientX)));
  };
  const laneDown = (e) => {
    if (e.target !== e.currentTarget) return;
    s.select(null);
    scrub(e);
  };

  const clipDown = (e, l) => {
    if (e.button !== 0) return;
    s.select({ type: 'clip', id: l.clip.id }, 'clip');
    let moved = false;
    drag(
      e,
      (dx) => {
        if (Math.abs(dx) > 5) moved = true;
        if (moved) setGhost({ id: l.clip.id, dx });
      },
      (dx, _dy, ev) => {
        setGhost(null);
        if (!moved) {
          player.seek(xToTime(ev.clientX));
          return;
        }
        // Bırakılan noktaya göre yeni sırayı hesapla
        const center = l.start + l.dur / 2 + dx / pps;
        const idx = L.filter((o) => o.clip.id !== l.clip.id && o.start + o.dur / 2 < center).length;
        if (idx !== l.index) s.moveClip(l.clip.id, idx);
      },
    );
  };

  const trim = (e, l, side) => {
    e.stopPropagation();
    s.select({ type: 'clip', id: l.clip.id }, 'clip');
    const m = project.media[l.clip.mediaId];
    const o = { in: l.clip.in, out: l.clip.out };
    const key = `trim-${l.clip.id}-${Date.now()}`;
    drag(e, (dx) => {
      const d = (dx / pps) * speedOf(l.clip); // ekrandaki süre → kaynak videodaki süre
      if (side === 'in') s.updateClip(l.clip.id, { in: clamp(o.in + d, 0, o.out - 0.1) }, key);
      else s.updateClip(l.clip.id, { out: clamp(o.out + d, o.in + 0.1, m.duration) }, key);
    });
  };

  const isSel = (type, id) => selection?.type === type && selection.id === id;

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <button onClick={() => s.splitAt(time)} disabled={!total} title="Kırmızı çubuğun olduğu yerden ikiye böl (S)">
          <Icon name="scissors" /> Böl
        </button>
        <button onClick={() => selClip && s.duplicateClip(selClip.id)} disabled={!selClip} title="Seçili parçayı çoğalt">
          <Icon name="copy" /> Çoğalt
        </button>
        <button onClick={() => s.deleteSelection()} disabled={!selection} title="Seçileni sil (Delete)">
          <Icon name="trash" /> Sil
        </button>
        <span className="sep" />
        <button onClick={() => s.addText()} title="Çubuğun olduğu yere metin ekle (T)">
          <Icon name="type" /> Metin
        </button>
        <button onClick={() => s.setUI({ tab: 'subs' })} title="Altyazı sekmesini aç">
          <Icon name="captions" /> Altyazı
        </button>
        <button onClick={cutAll} disabled={!total || cutting} title="Tüm parçalardaki konuşma boşluklarını otomatik kes">
          {cutting ? <span className="spinner" /> : <Icon name="wand" />} Boşlukları kes
        </button>
        <div className="spacer" />
        <span className="tl-tip">
          {total
            ? selClip
              ? 'Kenarlarını sürükleyerek kısalt · gövdesini sürükleyerek yerini değiştir'
              : 'İpucu: Çubuğu kesmek istediğin yere getir ve “Böl”e bas'
            : ''}
        </span>
        <button className="icon-btn" onClick={fit} disabled={!total} title="Tamamını sığdır">
          <Icon name="crop" />
        </button>
        <input
          type="range"
          min={4}
          max={400}
          value={pps}
          onChange={(e) => useStore.setState({ pxPerSec: Number(e.target.value) })}
          className="zoom"
          title="Yakınlaştır (Ctrl + tekerlek)"
        />
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <div className="ruler-pad" />
          <div className="lane-label video">
            <Icon name="film" size={13} /> Video
          </div>
          <div className="lane-label">
            <Icon name="type" size={13} /> Metin
          </div>
          <div className="lane-label">
            <Icon name="captions" size={13} /> Altyazı
          </div>
          {translations.length > 0 && (
            <div className="lane-label">
              <Icon name="languages" size={13} /> Çeviri
            </div>
          )}
          <div className="lane-label">
            <Icon name="music" size={13} /> Müzik
          </div>
        </div>
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-content" style={{ width: contentW }}>
            <div className="ruler" onPointerDown={scrub}>
              {ticks.map((t) => (
                <span key={t} style={{ left: t * pps }}>
                  {fmtTime(t, step < 1)}
                </span>
              ))}
            </div>

            <div className="lane video" onPointerDown={laneDown}>
              {!L.length && <div className="lane-empty">Eklediğin videolar burada sırayla dizilir</div>}
              {L.map((l) => {
                const m = project.media[l.clip.mediaId];
                const g = ghost?.id === l.clip.id;
                const speed = speedOf(l.clip);
                return (
                  <div
                    key={l.clip.id}
                    className={`clip${m?.type === 'image' ? ' image' : ''}${isSel('clip', l.clip.id) ? ' sel' : ''}${g ? ' dragging' : ''}${l.clip.muted ? ' muted' : ''}`}
                    style={{
                      left: l.start * pps,
                      width: l.dur * pps,
                      transform: g ? `translateX(${ghost.dx}px)` : undefined,
                      backgroundImage: m?.thumb ? `url(${m.thumb})` : undefined,
                    }}
                    onPointerDown={(e) => clipDown(e, l)}
                    title={`Parça ${l.index + 1}: ${m?.name}`}
                  >
                    <div className="handle l" onPointerDown={(e) => trim(e, l, 'in')} />
                    {m?.hasAudio && m.type !== 'image' && <Waveform path={m.path} from={l.clip.in} to={l.clip.out} width={Math.round(l.dur * pps)} />}
                    <span className="clip-num">{l.index + 1}</span>
                    <span className="clip-name">{m?.name}</span>
                    <span className="clip-dur">
                      {fmtTime(l.dur)}
                      {speed !== 1 && <b className="speed-badge">{speed}x</b>}
                    </span>
                    <div className="handle r" onPointerDown={(e) => trim(e, l, 'out')} />
                  </div>
                );
              })}
              {L.slice(1).map((l) => (
                <button
                  key={`tr-${l.clip.id}`}
                  className={`trans-btn${hasTrans(l.clip) ? ' on' : ''}`}
                  style={{ left: (l.start + l.tIn / 2) * pps }}
                  title={hasTrans(l.clip) ? 'Geçişi düzenle' : 'Bu iki parça arasına geçiş ekle'}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => s.select({ type: 'clip', id: l.clip.id }, 'clip')}
                >
                  <Icon name={hasTrans(l.clip) ? 'transition' : 'plus'} size={12} />
                </button>
              ))}
            </div>

            <div className="lane" onPointerDown={laneDown}>
              {project.texts.map((t) => (
                <TimedItem key={t.id} item={t} type="text" pps={pps} selected={isSel('text', t.id)} onUpdate={s.updateText} />
              ))}
            </div>

            <div className={`lane${project.showSubs === false ? ' dim' : ''}`} onPointerDown={laneDown}>
              {project.subtitles.map((t) => (
                <TimedItem key={t.id} item={t} type="sub" pps={pps} selected={isSel('sub', t.id)} onUpdate={s.updateSub} />
              ))}
            </div>

            {translations.length > 0 && (
              <div className={`lane${project.showTrans === false ? ' dim' : ''}`} onPointerDown={laneDown}>
                {translations.map((t) => (
                  <TimedItem key={t.id} item={t} type="tr" pps={pps} selected={isSel('tr', t.id)} onUpdate={s.updateTr} />
                ))}
              </div>
            )}

            <div className="lane" onPointerDown={laneDown}>
              {project.music && total > 0 && (
                <div className="item music" style={{ left: 0, width: total * pps }} onPointerDown={(e) => (e.stopPropagation(), s.setUI({ tab: 'music' }))}>
                  <span>♪ {project.music.name}</span>
                </div>
              )}
            </div>

            <div className="playhead" style={{ left: time * pps }} />
          </div>
        </div>
      </div>
    </div>
  );
}
