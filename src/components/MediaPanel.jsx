import { useStore } from '../store.js';
import { api } from '../api.js';
import { fmtTime } from '../timeline.js';
import { player } from '../player.js';
import Icon from './Icon.jsx';

export async function importMedia() {
  const s = useStore.getState();
  const { items, errors } = await api.openMedia('video');
  const visual = items.filter((m) => m.hasVideo);
  if (visual.length) {
    const wasEmpty = !s.project.clips.length;
    s.addMedia(visual);
    if (wasEmpty) player.seek(0);
    s.notify(`${visual.length} dosya eklendi`);
  }
  if (errors.length) s.notify(`Açılamayan dosyalar:\n${errors.join('\n')}`, 'error');
}

export async function importMusic() {
  const s = useStore.getState();
  const { items, errors } = await api.openMedia('audio');
  if (items[0]) {
    s.setMusic(items[0]);
    player.syncMusic(s.time);
    s.setUI({ tab: 'music' });
  }
  if (errors.length) s.notify(errors.join('\n'), 'error');
}

export default function MediaPanel() {
  const media = useStore((s) => s.project.media);
  const clips = useStore((s) => s.project.clips);
  const music = useStore((s) => s.project.music);
  const { addClip, removeMedia, setUI } = useStore.getState();
  const list = Object.values(media);
  const used = (id) => clips.filter((c) => c.mediaId === id).length;

  return (
    <aside className="panel media-panel">
      <div className="panel-head">
        <Icon name="film" /> Medya
      </div>
      <div className="panel-body">
        <button className="import" onClick={importMedia}>
          <Icon name="plus" /> Video / fotoğraf ekle
        </button>
        <p className="hint center">veya dosyaları pencereye sürükle</p>

        <ul className="media-list">
          {list.map((m) => (
            <li key={m.id} title={m.path}>
              <div className="media-thumb">
                {m.thumb ? <img src={m.thumb} alt="" /> : <Icon name={m.type === 'image' ? 'image' : 'film'} />}
                {m.type !== 'image' && <span className="mt-dur">{fmtTime(m.duration, false)}</span>}
              </div>
              <div className="media-info">
                <div className="media-name">{m.name}</div>
                <div className="media-meta">
                  {m.type === 'image' ? 'Fotoğraf' : m.hasAudio ? 'Video' : 'Video · sessiz'}
                  {used(m.id) > 1 && ` · ${used(m.id)} kez`}
                </div>
              </div>
              <div className="media-actions">
                <button className="icon-btn" title="Zaman çizelgesinin sonuna ekle" onClick={() => addClip(m.id)}>
                  <Icon name="plus" size={14} />
                </button>
                <button className="icon-btn" title="Projeden kaldır" onClick={() => removeMedia(m.id)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="panel-sub">
          <Icon name="music" size={13} /> Müzik
        </div>
        {music ? (
          <button className="music-card" onClick={() => setUI({ tab: 'music' })}>
            <Icon name="music" /> <span>{music.name}</span>
          </button>
        ) : (
          <button className="import secondary" onClick={importMusic}>
            <Icon name="plus" /> Müzik ekle
          </button>
        )}
      </div>
    </aside>
  );
}
