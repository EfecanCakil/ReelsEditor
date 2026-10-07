import { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { player } from '../player.js';
import { fmtTime, layout } from '../timeline.js';
import { buildJob, sliceProject } from '../exportJob.js';
import { FORMATS } from '../../shared/geom.mjs';
import { Seg } from './ui.jsx';
import Icon from './Icon.jsx';

const baseName = (projectPath) => (projectPath ? projectPath.split(/[\\/]/).pop().replace(/\.reels\.json$|\.json$/i, '') : 'reels');

export default function ExportModal() {
  const project = useStore((s) => s.project);
  const projectPath = useStore((s) => s.projectPath);
  const preset = useStore((s) => s.exportPreset);
  const L = layout(project.clips);
  const [mode, setMode] = useState(preset?.mode || 'single');
  const [picked, setPicked] = useState(() => new Set(preset?.only || project.clips.map((c) => c.id)));
  const [opts, setOpts] = useState({ quality: 'normal', fps: 30, normalize: true });
  const [state, setState] = useState({ phase: 'idle', progress: 0 });
  const F = FORMATS[project.format];
  const total = L.length ? L.at(-1).end : 0;
  const close = () => useStore.setState({ exportOpen: false, exportPreset: null });

  useEffect(() => api.on('export:progress', (p) => setState((s) => ({ ...s, progress: p.progress }))), []);

  const run = async (proj, output, label) => {
    setState((s) => ({ ...s, phase: 'prepare', progress: 0, label }));
    const job = await buildJob(proj, opts, output, (p) => setState((s) => ({ ...s, progress: p })));
    setState((s) => ({ ...s, phase: 'running', progress: 0, label }));
    player.suspend(true);
    try {
      return await api.exportStart(job);
    } finally {
      player.suspend(false);
    }
  };

  const start = async () => {
    player.pause();
    const base = baseName(projectPath);
    if (mode === 'single') {
      const output = await api.pickExportPath(`${base}.mp4`);
      if (!output) return;
      const r = await run(project, output, '');
      if (r.ok) setState({ phase: 'done', files: [output] });
      else if (r.cancelled) setState({ phase: 'idle', progress: 0 });
      else setState({ phase: 'error', error: r.error });
      return;
    }
    const parts = L.filter((l) => picked.has(l.clip.id));
    if (!parts.length) return;
    const folder = await api.pickFolder();
    if (!folder) return;
    const files = [];
    for (const [i, l] of parts.entries()) {
      let output = `${folder}\\${base}-parca-${l.index + 1}.mp4`;
      const [taken] = await api.exists([output]);
      if (taken) output = `${folder}\\${base}-parca-${l.index + 1}-${Date.now().toString(36)}.mp4`;
      const r = await run(sliceProject(project, l.index), output, `Parça ${i + 1} / ${parts.length}`);
      if (r.cancelled) return setState({ phase: 'idle', progress: 0 });
      if (!r.ok) return setState({ phase: 'error', error: `Parça ${l.index + 1}: ${r.error}` });
      files.push(output);
    }
    setState({ phase: 'done', files });
  };

  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const running = state.phase === 'running' || state.phase === 'prepare';
  const pickedCount = L.filter((l) => picked.has(l.clip.id)).length;

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && !running && close()}>
      <div className="modal export">
        {!running && (
          <button className="icon-btn modal-x" onClick={close} title="Kapat">
            <Icon name="x" />
          </button>
        )}
        <h2>
          <Icon name="download" size={20} /> Dışa aktar
        </h2>

        <div className="mode-cards">
          <button className={mode === 'single' ? 'on' : ''} onClick={() => (setMode('single'), setState({ phase: 'idle', progress: 0 }))} disabled={running}>
            <Icon name="film" size={22} />
            <b>Tek video</b>
            <span>Tüm parçalar birleşik, {fmtTime(total)}</span>
          </button>
          <button className={mode === 'parts' ? 'on' : ''} onClick={() => (setMode('parts'), setState({ phase: 'idle', progress: 0 }))} disabled={running || L.length < 1}>
            <Icon name="layers" size={22} />
            <b>Parçaları ayrı ayrı</b>
            <span>Her parça ayrı bir MP4 dosyası</span>
          </button>
        </div>

        {mode === 'parts' && (
          <div className="parts">
            <div className="parts-head">
              <span>Kaydedilecek parçalar</span>
              <button className="link" disabled={running} onClick={() => setPicked(new Set(picked.size === L.length ? [] : project.clips.map((c) => c.id)))}>
                {picked.size === L.length ? 'Hiçbiri' : 'Tümü'}
              </button>
            </div>
            <ul>
              {L.map((l) => {
                const m = project.media[l.clip.mediaId];
                return (
                  <li key={l.clip.id} className={picked.has(l.clip.id) ? 'on' : ''} onClick={() => !running && toggle(l.clip.id)}>
                    <span className="cb">{picked.has(l.clip.id) && <Icon name="check" size={12} stroke={3} />}</span>
                    <span className="pt-thumb">{m?.thumb && <img src={m.thumb} alt="" />}</span>
                    <b>Parça {l.index + 1}</b>
                    <span className="pt-name">{m?.name}</span>
                    <span className="pt-dur">{fmtTime(l.dur)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="hint">Her parça kendi aralığındaki metin, altyazı ve müzikle birlikte kaydedilir. Dosyalar seçeceğin klasöre “{baseName(projectPath)}-parca-N.mp4” adıyla yazılır.</p>
          </div>
        )}

        <div className="row2">
          <div className="field">
            <span className="field-label">Kalite</span>
            <Seg value={opts.quality} onChange={(v) => setOpts({ ...opts, quality: v })} options={[['high', 'Yüksek'], ['normal', 'Normal'], ['small', 'Küçük']]} />
          </div>
          <div className="field">
            <span className="field-label">Akıcılık</span>
            <Seg value={opts.fps} onChange={(v) => setOpts({ ...opts, fps: v })} options={[[30, '30 fps'], [60, '60 fps']]} />
          </div>
        </div>
        <div className="field-label">Son dokunuşlar</div>
        <div className="toggles wrap">
          <label className={`toggle${project.fadeIn ? ' on' : ''}`} title="Video siyahtan yumuşakça açılır">
            <input type="checkbox" checked={!!project.fadeIn} disabled={running} onChange={(e) => useStore.getState().setProjectFlag({ fadeIn: e.target.checked })} />
            Karardan aç
          </label>
          <label className={`toggle${project.fadeOut ? ' on' : ''}`} title="Video sonda yumuşakça kararır">
            <input type="checkbox" checked={!!project.fadeOut} disabled={running} onChange={(e) => useStore.getState().setProjectFlag({ fadeOut: e.target.checked })} />
            Kararak bitir
          </label>
          <label className={`toggle${opts.normalize ? ' on' : ''}`} title="Instagram/TikTok standardına göre ses seviyesini ayarlar (-14 LUFS)">
            <input type="checkbox" checked={opts.normalize} disabled={running} onChange={(e) => setOpts({ ...opts, normalize: e.target.checked })} />
            Sesi dengele
          </label>
        </div>
        <p className="hint">
          {F.label} · {F.w}×{F.h} · Normal kalite çoğu paylaşım için idealdir; “Yüksek” daha yavaş ve büyük dosya üretir.
        </p>

        {running && (
          <div className="progress-box">
            <div className="ai-row">
              <span className="spinner" />
              <b>
                {state.label && `${state.label} · `}
                {state.phase === 'prepare' ? 'Metin ve altyazılar hazırlanıyor…' : 'Video oluşturuluyor…'}
              </b>
              <span className="ai-pct">%{Math.round(state.progress * 100)}</span>
            </div>
            <div className="bar">
              <div style={{ width: `${state.progress * 100}%` }} />
            </div>
          </div>
        )}
        {state.phase === 'done' && (
          <div className="ok-box">
            <div>
              <Icon name="check" stroke={3} /> {state.files.length > 1 ? `${state.files.length} dosya kaydedildi` : 'Video kaydedildi'}
            </div>
            <button onClick={() => api.showItem(state.files[0])}>
              <Icon name="folder" /> Klasörde göster
            </button>
          </div>
        )}
        {state.phase === 'error' && <pre className="err-box">{state.error}</pre>}

        <div className="modal-actions">
          {running ? (
            <button className="danger" disabled={state.phase === 'prepare'} onClick={() => api.exportCancel()}>
              İptal
            </button>
          ) : (
            <>
              <button onClick={close}>Kapat</button>
              <button className="primary" onClick={start} disabled={mode === 'parts' && !pickedCount}>
                <Icon name="download" />
                {mode === 'single' ? (state.phase === 'done' ? 'Tekrar kaydet' : 'MP4 olarak kaydet') : `${pickedCount} parçayı kaydet`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
