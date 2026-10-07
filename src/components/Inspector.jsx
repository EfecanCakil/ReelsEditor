import { useStore } from '../store.js';
import { player } from '../player.js';
import { fmtTime } from '../timeline.js';
import { Range, NumberField, Empty, StyleEditor } from './ui.jsx';
import { importMusic } from './MediaPanel.jsx';
import ClipTab from './ClipTab.jsx';
import SubsTab from './SubsTab.jsx';
import Icon from './Icon.jsx';

const pct = (v) => `${Math.round(v * 100)}%`;

// Hazır metin şablonları: stil + animasyon
const TEXT_TEMPLATES = [
  { name: 'Başlık', preview: 'BAŞLIK', text: 'BAŞLIĞINI YAZ', style: { fontSize: 110, fontWeight: 900, uppercase: true, bg: 'stroke', color: '#ffffff', y: 0.2 }, anim: { in: 'pop', out: 'fade' } },
  { name: 'Vurgu kutusu', preview: 'Önemli', text: 'Önemli nokta', style: { fontSize: 76, fontWeight: 800, bg: 'box', boxColor: '#ff2d6f', color: '#ffffff', y: 0.35 }, anim: { in: 'slide', out: 'fade' } },
  { name: 'Etiket', preview: 'YENİ', text: 'YENİ', style: { fontSize: 70, fontWeight: 900, bg: 'box', boxColor: '#ffd400', color: '#111111', uppercase: true, y: 0.12 }, anim: { in: 'pop' } },
  { name: 'Alıntı', preview: '“Söz”', text: '“Buraya bir söz yaz”', style: { font: 'Georgia', fontSize: 64, fontWeight: 600, bg: 'shadow', color: '#ffffff', y: 0.5 }, anim: { in: 'fade', out: 'fade' } },
  { name: 'Daktilo', preview: 'Yazı…', text: 'Kelime kelime yazılır', style: { fontSize: 68, fontWeight: 700, bg: 'stroke', y: 0.4 }, anim: { in: 'type' } },
  { name: 'Takip et', preview: 'Takip et', text: 'Takip et 👉', style: { fontSize: 72, fontWeight: 800, bg: 'box', boxColor: '#000000', color: '#ffffff', y: 0.86 }, anim: { in: 'slide', out: 'fade' } },
];

// Şablon düğmesindeki küçük önizleme
const tplStyle = (st) => ({
  fontFamily: st.font || 'Segoe UI',
  fontWeight: st.fontWeight,
  color: st.color || '#fff',
  background: st.bg === 'box' ? st.boxColor : 'transparent',
  WebkitTextStroke: st.bg === 'stroke' ? '1px #000' : undefined,
  textShadow: st.bg === 'shadow' ? '0 2px 6px #000' : undefined,
});

function TextTab() {
  const sel = useStore((s) => s.selection);
  const texts = useStore((s) => s.project.texts);
  const s = useStore.getState();
  const t = sel?.type === 'text' && texts.find((x) => x.id === sel.id);

  return (
    <div className="tab-body">
      <div className="field-label">Şablonla ekle (çubuğun olduğu yere)</div>
      <div className="tpl-grid">
        {TEXT_TEMPLATES.map((tp) => (
          <button key={tp.name} className="tpl" onClick={() => s.addText(tp)} title={`${tp.name} ekle`}>
            <span className="tpl-prev" style={tplStyle(tp.style)}>
              {tp.preview}
            </span>
            <small>{tp.name}</small>
          </button>
        ))}
      </div>
      {texts.length > 0 && (
        <ul className="item-list">
          {texts.map((x) => (
            <li key={x.id} className={x.id === t?.id ? 'sel' : ''} onClick={() => (s.select({ type: 'text', id: x.id }), player.seek(x.start))}>
              <span className="time">{fmtTime(x.start)}</span>
              <span className="txt">{x.text}</span>
            </li>
          ))}
        </ul>
      )}
      {t ? (
        <section>
          <h4>Seçili metin</h4>
          <textarea rows={3} value={t.text} onChange={(e) => s.updateText(t.id, { text: e.target.value }, `${t.id}-text`)} />
          <div className="row2">
            <NumberField label="Başlangıç (sn)" value={t.start} min={0}
              onChange={(v) => s.updateText(t.id, { start: Math.max(0, Math.min(v, t.end - 0.1)) }, `${t.id}-st`)} />
            <NumberField label="Bitiş (sn)" value={t.end} min={0}
              onChange={(v) => s.updateText(t.id, { end: Math.max(v, t.start + 0.1) }, `${t.id}-en`)} />
          </div>
          <div className="row2">
            <label className="field">
              <span className="field-label">Giriş animasyonu</span>
              <select value={t.anim?.in || 'none'} onChange={(e) => s.updateText(t.id, { anim: { ...t.anim, in: e.target.value } })}>
                <option value="none">Yok</option>
                <option value="fade">Belir</option>
                <option value="pop">Büyüyerek gel</option>
                <option value="slide">Aşağıdan kay</option>
                <option value="type">Kelime kelime yaz</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Çıkış</span>
              <select value={t.anim?.out || 'none'} onChange={(e) => s.updateText(t.id, { anim: { ...t.anim, out: e.target.value } })}>
                <option value="none">Yok</option>
                <option value="fade">Kaybol</option>
              </select>
            </label>
          </div>
          <StyleEditor style={t.style} keyPrefix={t.id} onChange={(patch, key) => s.updateText(t.id, { style: patch }, key)} />
          <div className="btn-row">
            <button className="danger" onClick={() => s.deleteSelection()}>Metni sil</button>
          </div>
        </section>
      ) : (
        texts.length > 0 && <Empty>Düzenlemek için bir metin seçin.</Empty>
      )}
    </div>
  );
}

function MusicTab() {
  const music = useStore((s) => s.project.music);
  const time = useStore((s) => s.time);
  const s = useStore.getState();
  if (!music)
    return (
      <div className="tab-body">
        <button className="import" onClick={importMusic}>+ Müzik ekle</button>
        <Empty>Arka plan müziği ekleyin. Video sonunda otomatik olarak yavaşça kısılır.</Empty>
      </div>
    );
  return (
    <div className="tab-body">
      <h3>♪ {music.name}</h3>
      <p className="hint">Süre: {fmtTime(music.duration)} · Video boyunca döngüde çalar</p>
      <Range label="Müzik sesi" value={music.volume} min={0} max={1} onChange={(v) => s.updateMusic({ volume: v }, 'mvol')} format={pct} />
      <Range
        label="Müziğin başlangıç noktası"
        value={music.offset}
        min={0}
        max={Math.max(0, music.duration - 1)}
        step={0.1}
        onChange={(v) => {
          s.updateMusic({ offset: v }, 'moff');
          player.syncMusic(time);
        }}
        format={(v) => fmtTime(v)}
      />
      <label className={`toggle block${music.duck ? ' on' : ''}`} title="Videodaki konuşma sırasında müzik ~11 dB kısılır, duraklamalarda geri gelir">
        <input type="checkbox" checked={!!music.duck} onChange={(e) => s.updateMusic({ duck: e.target.checked })} />
        Konuşma varken müziği otomatik kıs
      </label>
      <div className="btn-row">
        <button onClick={importMusic}>Değiştir</button>
        <button className="danger" onClick={() => (s.setMusic(null), player.syncMusic(time))}>Kaldır</button>
      </div>
      <section>
        <h4>Videoların orijinal sesi</h4>
        <div className="btn-row">
          <button onClick={() => s.updateAllClips({ volume: 1, muted: false })}>Normal</button>
          <button onClick={() => s.updateAllClips({ volume: 0.3, muted: false })}>Kıs (%30)</button>
          <button onClick={() => s.updateAllClips({ muted: true })}>Tümünü sessize al</button>
        </div>
      </section>
    </div>
  );
}

const TABS = [
  ['clip', 'Parça', 'film', ClipTab],
  ['text', 'Metin', 'type', TextTab],
  ['subs', 'Altyazı', 'captions', SubsTab],
  ['music', 'Müzik', 'music', MusicTab],
];

export default function Inspector() {
  const tab = useStore((s) => s.tab);
  const Tab = TABS.find((t) => t[0] === tab)[3];
  return (
    <aside className="panel inspector">
      <nav className="tabs">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={k === tab ? 'on' : ''} onClick={() => useStore.setState({ tab: k })}>
            <Icon name={icon} size={15} />
            {label}
          </button>
        ))}
      </nav>
      <div className="panel-body">
        <Tab />
      </div>
    </aside>
  );
}
