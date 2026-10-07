import { useStore } from '../store.js';
import { FORMATS } from '../../shared/geom.mjs';
import { saveProject, openProject, goHome } from '../projectActions.js';
import Icon from './Icon.jsx';

export { saveProject };

function FormatIcon({ k }) {
  const f = FORMATS[k];
  const s = 14 / Math.max(f.w, f.h);
  return <span className="fmt-ic" style={{ width: f.w * s, height: f.h * s }} />;
}

export default function TopBar() {
  const format = useStore((s) => s.project.format);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const hasClips = useStore((s) => s.project.clips.length > 0);
  const projectPath = useStore((s) => s.projectPath);
  const dirty = useStore((s) => s.dirty);
  const { undo, redo, setFormat, setUI } = useStore.getState();
  const name = projectPath ? projectPath.split(/[\\/]/).pop().replace(/\.reels\.json$|\.json$/i, '') : 'Adsız proje';

  return (
    <header className="topbar">
      <button className="brand-btn" onClick={goHome} title="Ana sayfaya dön">
        <span className="logo">
          <Icon name="play" size={12} />
        </span>
        <Icon name="home" size={15} />
      </button>
      <div className="proj-name" title={projectPath || 'Henüz kaydedilmedi'}>
        {name}
        {dirty && <span className="dirty-dot" title="Kaydedilmemiş değişiklikler var" />}
      </div>

      <div className="tb-group">
        <button onClick={() => openProject()} title="Kayıtlı bir projeyi aç">
          <Icon name="folder" /> Aç
        </button>
        <button onClick={saveProject} title="Projeyi kaydet (Ctrl+S)">
          <Icon name="save" /> Kaydet
        </button>
      </div>
      <div className="tb-group">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Geri al (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Yinele (Ctrl+Y)">
          <Icon name="redo" />
        </button>
      </div>

      <div className="spacer" />

      <div className="format-pills" role="radiogroup" aria-label="Video formatı">
        {Object.entries(FORMATS).map(([k, f]) => (
          <button key={k} className={k === format ? 'on' : ''} onClick={() => setFormat(k)} title={f.label}>
            <FormatIcon k={k} />
            {k}
          </button>
        ))}
      </div>

      <button className="icon-btn" onClick={() => setUI({ helpOpen: true })} title="Nasıl kullanılır? (?)">
        <Icon name="help" size={18} />
      </button>
      <button className="primary" disabled={!hasClips} onClick={() => setUI({ exportOpen: true, exportPreset: null })} title={hasClips ? '' : 'Önce medya ekleyin'}>
        <Icon name="download" /> Dışa aktar
      </button>
    </header>
  );
}
