import { useState } from 'react';
import { useStore } from '../store.js';
import { cutSilences, SILENCE_LEVELS } from '../silence.js';
import { COLOR_PRESETS, defaultColor } from '../../shared/color.mjs';
import { fmtTime, layout, speedOf } from '../timeline.js';
import { TRANSITIONS } from '../../shared/geom.mjs';
import { Range, Seg, NumberField, Empty } from './ui.jsx';
import Icon from './Icon.jsx';

const pct = (v) => `${Math.round(v * 100)}%`;
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3];

export default function ClipTab() {
  const sel = useStore((s) => s.selection);
  const clips = useStore((s) => s.project.clips);
  const media = useStore((s) => s.project.media);
  const time = useStore((s) => s.time);
  const s = useStore.getState();
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState('normal');
  const index = sel?.type === 'clip' ? clips.findIndex((c) => c.id === sel.id) : -1;

  const runSilence = async (ids) => {
    if (s.project.subtitles.length && !confirm('Kesimden sonra mevcut altyazılar kayabilir. Altyazıyı kesimden sonra yeniden oluşturman önerilir. Devam edilsin mi?')) return;
    setBusy(true);
    try {
      const r = await cutSilences(ids, level);
      s.notify(r.saved > 0.05 ? `${r.cuts} boşluk kesildi, video ${r.saved.toFixed(1)} sn kısaldı. Beğenmezsen Ctrl+Z ile geri al.` : 'Kesilecek belirgin bir boşluk bulunamadı.');
    } catch (err) {
      s.notify(`Sessizlik analizi yapılamadı: ${err.message}`, 'error');
    }
    setBusy(false);
  };
  const clip = clips[index];
  if (!clip)
    return (
      <Empty>
        <Icon name="film" size={28} />
        <b>Bir parça seç</b>
        {clips.length
          ? 'Alttaki zaman çizelgesinde bir parçaya tıkla; kırpma, hız, kadraj, ses ve geçiş ayarları burada görünür.'
          : 'Önce soldan video veya fotoğraf ekle.'}
      </Empty>
    );
  const m = media[clip.mediaId];
  const isImage = m.type === 'image';
  const l = layout(clips)[index];
  const speed = speedOf(clip);
  const tr = clip.transition || { type: 'none', duration: 0.5 };
  const col = { ...defaultColor(), ...clip.color };
  const up = (patch, key) => s.updateClip(clip.id, patch, key && `${clip.id}-${key}`);

  return (
    <div className="tab-body">
      <div className="clip-head">
        <div className="ch-thumb">{m.thumb && <img src={m.thumb} alt="" />}</div>
        <div>
          <h3 title={m.path}>Parça {index + 1}</h3>
          <div className="hint">{m.name}</div>
        </div>
      </div>
      <p className="hint">
        Kaynak: {m.width}×{m.height} · Ekranda {fmtTime(l.dur)}
      </p>

      {index > 0 && (
        <section className="card">
          <h4>Önceki parçadan geçiş</h4>
          <div className="trans-grid">
            {TRANSITIONS.map(([v, label]) => (
              <button key={v} className={tr.type === v ? 'on' : ''} onClick={() => up({ transition: { ...tr, type: v } })}>
                {label}
              </button>
            ))}
          </div>
          {tr.type !== 'none' && (
            <>
              <Range
                label="Geçiş süresi"
                value={tr.duration}
                min={0.2}
                max={2}
                step={0.05}
                onChange={(v) => up({ transition: { ...tr, duration: v } }, 'trd')}
                format={(v) => `${v.toFixed(2)} sn`}
              />
              {l.tIn + 0.01 < tr.duration && <p className="hint">Parçalar kısa olduğu için {l.tIn.toFixed(2)} sn uygulanıyor.</p>}
            </>
          )}
          <button onClick={() => s.updateAllClips({ transition: { ...tr } })}>Tüm geçişlere uygula</button>
        </section>
      )}

      <section>
        <h4>{isImage ? 'Süre' : 'Kırpma'}</h4>
        {isImage ? (
          <NumberField
            label="Ekranda kalma süresi (sn)"
            value={clip.out - clip.in}
            min={0.5}
            onChange={(v) => up({ out: clip.in + Math.max(0.5, Math.min(600, v)) }, 'dur')}
          />
        ) : (
          <div className="row2">
            <NumberField label="Başlangıç (sn)" value={clip.in} min={0} max={clip.out - 0.1}
              onChange={(v) => up({ in: Math.min(Math.max(0, v), clip.out - 0.1) }, 'in')} />
            <NumberField label="Bitiş (sn)" value={clip.out} min={clip.in + 0.1} max={m.duration}
              onChange={(v) => up({ out: Math.max(Math.min(m.duration, v), clip.in + 0.1) }, 'out')} />
          </div>
        )}
        <div className="btn-row">
          <button onClick={() => s.splitAt(time)} title="Kırmızı çubuğun olduğu yerden ikiye böl (S)">
            <Icon name="scissors" /> Çubuktan böl
          </button>
          <button onClick={() => s.duplicateClip(clip.id)}>
            <Icon name="copy" /> Çoğalt
          </button>
        </div>
        <div className="btn-row">
          <button disabled={index === 0} onClick={() => s.moveClip(clip.id, index - 1)}>◀ Öne al</button>
          <button disabled={index === clips.length - 1} onClick={() => s.moveClip(clip.id, index + 1)}>Sona al ▶</button>
          <button className="danger" onClick={() => s.deleteSelection()}>
            <Icon name="trash" /> Sil
          </button>
        </div>
        <button className="block" onClick={() => s.setUI({ exportOpen: true, exportPreset: { mode: 'parts', only: [clip.id] } })}>
          <Icon name="download" /> Bu parçayı ayrı kaydet
        </button>
      </section>

      {!isImage && m.hasAudio && (
        <section className="card silence-card">
          <h4>
            <Icon name="wand" /> Sessizlikleri otomatik kes
          </h4>
          <p className="hint">Konuşmadaki boşluklar ve duraklamalar çıkarılır, parça konuşan bölümlerine ayrılır.</p>
          <div className="field-label">Ne kadar kesilsin?</div>
          <Seg value={level} onChange={setLevel} options={Object.entries(SILENCE_LEVELS).map(([k, v]) => [k, v.label])} />
          <button className="block" disabled={busy} onClick={() => runSilence([clip.id])}>
            {busy ? <span className="spinner" /> : <Icon name="scissors" />} Bu parçadaki boşlukları kes
          </button>
        </section>
      )}

      {!isImage && (
        <section>
          <h4>Hız</h4>
          <Seg value={speed} onChange={(v) => up({ speed: v })} options={SPEEDS.map((v) => [v, `${v}x`])} />
          <Range label="Özel hız" value={speed} min={0.25} max={4} step={0.05} onChange={(v) => up({ speed: v }, 'speed')} format={(v) => `${v.toFixed(2)}x`} />
        </section>
      )}

      <section>
        <h4>Kadraj</h4>
        <Seg
          value={clip.fit}
          onChange={(v) => up({ fit: v })}
          options={[['blur', 'Bulanık arka plan'], ['fit', 'Siyah kenar'], ['fill', 'Doldur (kırp)']]}
        />
        <Range label="Yakınlaştırma" value={clip.zoom} min={1} max={3} onChange={(v) => up({ zoom: v }, 'zoom')} format={pct} />
        <Range label="Yatay konum" value={clip.offX} min={0} max={1} onChange={(v) => up({ offX: v }, 'offX')} format={pct} />
        <Range label="Dikey konum" value={clip.offY} min={0} max={1} onChange={(v) => up({ offY: v }, 'offY')} format={pct} />
        <div className="btn-row">
          <button onClick={() => up({ zoom: 1, offX: 0.5, offY: 0.5 })}>Ortala</button>
          <button onClick={() => s.updateAllClips({ fit: clip.fit, zoom: clip.zoom, offX: clip.offX, offY: clip.offY })}>
            Tüm parçalara uygula
          </button>
        </div>
      </section>

      <section>
        <h4>Renk</h4>
        <div className="color-presets">
          {COLOR_PRESETS.map(([k, label, v]) => {
            const on = ['b', 'c', 's', 'w'].every((x) => Math.abs((col[x] ?? defaultColor()[x]) - v[x]) < 1e-3);
            return (
              <button key={k} className={`cp${on ? ' on' : ''}`} onClick={() => up({ color: { ...v } })} title={label}>
                <span className="cp-sw" style={{ filter: `brightness(${v.b}) contrast(${v.c}) saturate(${v.s}) sepia(${Math.max(0, v.w) * 0.35}) hue-rotate(${Math.min(0, v.w) * 25}deg)`, backgroundImage: m.thumb ? `url(${m.thumb})` : undefined }} />
                {label}
              </button>
            );
          })}
        </div>
        <Range label="Parlaklık" value={col.b} min={0.6} max={1.5} onChange={(v) => up({ color: { ...col, b: v } }, 'cb')} format={(v) => `${Math.round((v - 1) * 100)}`} />
        <Range label="Kontrast" value={col.c} min={0.6} max={1.5} onChange={(v) => up({ color: { ...col, c: v } }, 'cc')} format={(v) => `${Math.round((v - 1) * 100)}`} />
        <Range label="Doygunluk" value={col.s} min={0} max={2} onChange={(v) => up({ color: { ...col, s: v } }, 'cs')} format={(v) => `${Math.round((v - 1) * 100)}`} />
        <Range label="Sıcaklık" value={col.w} min={-1} max={1} onChange={(v) => up({ color: { ...col, w: v } }, 'cw')} format={(v) => `${Math.round(v * 100)}`} />
        <div className="btn-row">
          <button onClick={() => up({ color: defaultColor() })}>Sıfırla</button>
          <button onClick={() => s.updateAllClips({ color: { ...col } })}>Tüm parçalara uygula</button>
        </div>
      </section>

      {!isImage && (
        <section>
          <h4>Ses</h4>
          {m.hasAudio ? (
            <>
              <Range label="Ses seviyesi" value={clip.volume} min={0} max={2} onChange={(v) => up({ volume: v }, 'vol')} format={pct} />
              <label className="check">
                <input type="checkbox" checked={clip.muted} onChange={(e) => up({ muted: e.target.checked })} />
                Sessize al
              </label>
            </>
          ) : (
            <p className="hint">Bu videoda ses yok.</p>
          )}
        </section>
      )}
    </div>
  );
}
