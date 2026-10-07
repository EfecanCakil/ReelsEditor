import { useEffect, useState } from 'react';
import { useStore, newId } from '../store.js';
import { api } from '../api.js';
import { player } from '../player.js';
import { layout, fmtTime, srtTime, speedOf } from '../timeline.js';
import { Range, Seg, StyleEditor } from './ui.jsx';
import Icon from './Icon.jsx';

const LANGS = [
  ['turkish', 'Türkçe'],
  ['english', 'İngilizce'],
  ['german', 'Almanca'],
  ['french', 'Fransızca'],
  ['spanish', 'İspanyolca'],
  ['italian', 'İtalyanca'],
  ['portuguese', 'Portekizce'],
  ['russian', 'Rusça'],
  ['arabic', 'Arapça'],
  ['persian', 'Farsça'],
  ['azerbaijani', 'Azerbaycanca'],
  ['dutch', 'Felemenkçe'],
  ['japanese', 'Japonca'],
  ['korean', 'Korece'],
  ['chinese', 'Çince'],
  ['hindi', 'Hintçe'],
];
const langName = (k) => LANGS.find((l) => l[0] === k)?.[1] || k;

const ASR_MODELS = [
  ['whisper-small', 'Önerilen', '250 MB', 'Türkçede iyi sonuç, makul hız'],
  ['whisper-base', 'Hızlı', '290 MB', 'Daha hızlı, net konuşmalarda yeterli'],
  ['whisper-turbo', 'En doğru', '1,1 GB', 'Gürültülü kayıtlar için; yavaş ve büyük'],
];
const trModelOf = (from, to) => (from === 'turkish' && to === 'english' ? ['opus-tr-en', '115 MB'] : ['nllb', '900 MB']);

// Hazır altyazı stilleri (konum korunur, yalnızca görünüm değişir)
const SUB_PRESETS = [
  ['Reels', { font: 'Segoe UI', fontSize: 74, fontWeight: 900, color: '#ffffff', bg: 'stroke', boxColor: '#000000', uppercase: true, highlight: 'color', hlColor: '#ffe100', anim: 'pop' }],
  ['Büyüyen', { font: 'Segoe UI', fontSize: 70, fontWeight: 800, color: '#ffffff', bg: 'stroke', boxColor: '#000000', uppercase: false, highlight: 'pop', hlColor: '#4ade80', anim: 'none' }],
  ['Karaoke', { font: 'Segoe UI', fontSize: 66, fontWeight: 800, color: '#ffffff', bg: 'stroke', boxColor: '#000000', uppercase: false, highlight: 'box', hlColor: '#8b5cf6', anim: 'none' }],
  ['Kutulu', { font: 'Segoe UI', fontSize: 60, fontWeight: 700, color: '#ffffff', bg: 'box', boxColor: '#000000', uppercase: false, highlight: 'color', hlColor: '#ffd400', anim: 'fade' }],
  ['Neon', { font: 'Bahnschrift', fontSize: 70, fontWeight: 700, color: '#7df9ff', bg: 'shadow', boxColor: '#000000', uppercase: true, highlight: 'color', hlColor: '#ff4dd8', anim: 'slide' }],
  ['Belirerek', { font: 'Segoe UI', fontSize: 68, fontWeight: 800, color: '#ffffff', bg: 'stroke', boxColor: '#000000', uppercase: false, highlight: 'reveal', anim: 'none' }],
  ['Sade', { font: 'Segoe UI', fontSize: 58, fontWeight: 600, color: '#ffffff', bg: 'shadow', boxColor: '#000000', uppercase: false, highlight: 'none', anim: 'fade' }],
  ['Sinema', { font: 'Georgia', fontSize: 56, fontWeight: 600, color: '#fff7e0', bg: 'shadow', boxColor: '#000000', uppercase: false, highlight: 'none', anim: 'none' }],
];

// Whisper'ın sessiz/müzikli yerlerde uydurduğu bilinen kalıplar
const HALLUCINATION = /^(altyaz[ıi]\s*m\.?\s*k\.?|altyaz[ıi]lar?\s*m\.?\s*k\.?|izlediğiniz için teşekkürler[.!]?|abone olmayı unutmayın[.!]?|thanks for watching[.!]?|subtitles by.*)$/i;
const NOISE_WORD = /^[[(♪*].*[\])♪*]$/;

// Whisper kelimelerini Reels tarzı kısa satırlara grupla. Kelime zamanları altyazının başına göre saklanır.
function groupWords(words, maxWords) {
  const clean = words.filter((w) => !NOISE_WORD.test(w.text));
  const out = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].start;
    out.push({
      id: newId('s'),
      start,
      end: cur.at(-1).end,
      text: cur.map((w) => w.text).join(' '),
      words: cur.map((w) => ({ s: w.start - start, e: w.end - start })),
    });
    cur = [];
  };
  for (const w of clean) {
    if (cur.length && (cur.length >= maxWords || w.start - cur.at(-1).end > 0.6)) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  // Müzik/ton üzerine uydurulan satırlarda kelimeler anormal uzun sürer (gerçek konuşmada kelime < ~1,5 sn)
  const list = out.filter((s) => !HALLUCINATION.test(s.text.trim()) && (s.end - s.start) / s.words.length < 1.6);
  // Satırlar arasında kısa boşluklarda yazı yanıp sönmesin
  list.forEach((s, i) => {
    const next = list[i + 1];
    s.end = next ? Math.max(s.end, Math.min(next.start, s.end + 0.4)) : s.end + 0.4;
  });
  return list;
}

// Altyazıları cümlelere birleştir (çeviri cümle bütünlüğüyle yapılsın diye)
function sentences(subs) {
  const groups = [];
  let cur = [];
  for (const s of subs) {
    const prev = cur.at(-1);
    if (prev && (s.start - prev.end > 0.8 || prev.end - cur[0].start > 10)) (groups.push(cur), (cur = []));
    cur.push(s);
    if (/[.!?…]["')]*$/.test(s.text.trim())) (groups.push(cur), (cur = []));
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => ({ start: g[0].start, end: g.at(-1).end, text: g.map((s) => s.text.trim()).join(' ') }));
}

// Uzun çeviriyi okunabilir parçalara böl; süreyi harf sayısına göre paylaştır
function chunkTranslation(sen, text, maxWords) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || !/\p{L}/u.test(text)) return [];
  const groups = [];
  for (let i = 0; i < words.length; i += maxWords) groups.push(words.slice(i, i + maxWords).join(' '));
  const chars = groups.reduce((a, g) => a + g.length, 0) || 1;
  let t = sen.start;
  return groups.map((g) => {
    const d = ((sen.end - sen.start) * g.length) / chars;
    const item = { id: newId('r'), start: t, end: t + d, text: g };
    t += d;
    return item;
  });
}

const STAGE = {
  model: 'Model hazırlanıyor…',
  download: 'Model indiriliyor (yalnızca ilk sefer)',
  transcribe: 'Konuşma yazıya dökülüyor…',
  translate: 'Çevriliyor…',
};
const fmtEta = (s) => (s == null ? '' : s < 60 ? `~${s} sn kaldı` : `~${Math.round(s / 60)} dk kaldı`);

function AiProgress({ job, onCancel }) {
  return (
    <div className="ai-progress">
      <div className="ai-row">
        <span className="spinner" />
        <b>{STAGE[job.stage] || 'Hazırlanıyor…'}</b>
        <span className="ai-pct">%{Math.round((job.progress || 0) * 100)}</span>
      </div>
      <div className="bar">
        <div style={{ width: `${(job.progress || 0) * 100}%` }} />
      </div>
      <div className="ai-row muted">
        <span>
          {job.stage === 'download' && `${job.loadedMB} / ${job.totalMB} MB · ${fmtEta(job.etaSec)}`}
          {job.stage === 'transcribe' && job.count > 1 && `Parça ${job.index + 1} / ${job.count}`}
          {job.stage === 'translate' && `Cümle ${job.index + 1} / ${job.count}`}
          {job.stage === 'model' && 'Model belleğe yükleniyor'}
        </span>
        <button className="link danger" onClick={onCancel}>
          İptal
        </button>
      </div>
    </div>
  );
}

function StepCard({ n, icon, title, done, children, disabled }) {
  return (
    <section className={`step-card${disabled ? ' disabled' : ''}`}>
      <div className="sc-head">
        <span className={`sc-num${done ? ' done' : ''}`}>{done ? <Icon name="check" size={13} stroke={3} /> : n}</span>
        <Icon name={icon} />
        <h4>{title}</h4>
      </div>
      {children}
    </section>
  );
}

export default function SubsTab() {
  const sel = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const { subtitles: subs, subStyle, trStyle } = project;
  const translations = project.translations || [];
  const s = useStore.getState();
  const [lang, setLang] = useState(project.subLang || 'turkish');
  const [model, setModel] = useState('whisper-small');
  const [maxWords, setMaxWords] = useState(3);
  const [target, setTarget] = useState(project.subLang === 'english' ? 'turkish' : 'english');
  const [trWords, setTrWords] = useState(6);
  const [job, setJob] = useState(null); // { kind: 'asr' | 'tr', stage, progress, ... }
  const [cached, setCached] = useState({});
  const [list, setList] = useState('sub');
  const [styleOpen, setStyleOpen] = useState(null);

  const refreshCached = () => api.aiModels().then(setCached);
  useEffect(() => {
    refreshCached();
    return api.on('ai:progress', (p) => setJob((j) => j && { ...j, ...p }));
  }, []);
  useEffect(() => setLang(project.subLang || 'turkish'), [project.subLang]);

  const generate = async () => {
    const segments = layout(project.clips)
      .filter((l) => project.media[l.clip.mediaId]?.hasAudio && !l.clip.muted)
      .map((l) => ({ path: project.media[l.clip.mediaId].path, in: l.clip.in, out: l.clip.out, offset: l.start, speed: speedOf(l.clip) }));
    if (!segments.length) return s.notify('Zaman çizelgesinde sesli bir video yok. Önce konuşma içeren bir video ekleyin.', 'warn');
    if (subs.length && !confirm('Mevcut altyazılar silinip yeniden oluşturulsun mu?')) return;
    player.pause();
    setJob({ kind: 'asr', stage: 'model', progress: 0 });
    const r = await api.transcribe({ segments, language: lang, model });
    setJob(null);
    refreshCached();
    if (!r.ok) return r.cancelled ? s.notify('Altyazı oluşturma iptal edildi') : s.notify(`Altyazı oluşturulamadı: ${r.error}`, 'error');
    const out = groupWords(r.result, maxWords);
    if (!out.length) return s.notify('Videoda anlaşılır bir konuşma bulunamadı. Dili ve ses seviyesini kontrol edin.', 'warn');
    s.setSubtitles(out, lang);
    if (translations.length) s.setTranslations([]);
    s.notify(`${out.length} altyazı oluşturuldu. Satırlara tıklayarak düzeltebilirsin.`);
  };

  const translate = async () => {
    if (!subs.length) return;
    const from = project.subLang || lang;
    if (from === target) return s.notify('Çeviri dili, konuşma dilinden farklı olmalı', 'warn');
    player.pause();
    const sens = sentences(subs);
    setJob({ kind: 'tr', stage: 'model', progress: 0 });
    const r = await api.translate({ texts: sens.map((x) => x.text), from, to: target });
    setJob(null);
    refreshCached();
    if (!r.ok) return r.cancelled ? s.notify('Çeviri iptal edildi') : s.notify(`Çeviri yapılamadı: ${r.error}`, 'error');
    const out = sens.flatMap((sen, i) => chunkTranslation(sen, r.result[i], trWords));
    s.setTranslations(out, target);
    s.notify(`${langName(target)} çeviri eklendi`);
  };

  const exportSrt = async (items, name) => {
    const srt = items.map((x, i) => `${i + 1}\n${srtTime(x.start)} --> ${srtTime(x.end)}\n${x.text}\n`).join('\n');
    const p = await api.saveText(srt, name, 'srt');
    if (p) s.notify('SRT dosyası kaydedildi');
  };

  const busy = !!job;
  const [trKey, trSize] = trModelOf(project.subLang || lang, target);
  const shown = list === 'sub' ? subs : translations;

  return (
    <div className="tab-body subs-tab">
      <StepCard n={1} icon="sparkles" title="Konuşmayı yazıya dök" done={subs.length > 0}>
        <label className="field">
          <span className="field-label">Videodaki konuşma dili</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
            {LANGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            <option value="auto">Otomatik algıla</option>
          </select>
        </label>
        <div className="field-label">Doğruluk</div>
        <div className="model-cards">
          {ASR_MODELS.map(([k, title, size, desc]) => (
            <button key={k} className={`model-card${model === k ? ' on' : ''}`} onClick={() => setModel(k)} disabled={busy} title={desc}>
              <b>{title}</b>
              <span>{cached[k] ? <em className="ok">✓ hazır</em> : size}</span>
            </button>
          ))}
        </div>
        <p className="hint">{ASR_MODELS.find((m) => m[0] === model)[3]}{!cached[model] && ' · İlk kullanımda bir kez indirilir.'}</p>
        <Range label="Ekranda aynı anda en fazla kelime" value={maxWords} min={1} max={8} step={1} onChange={setMaxWords} />
        {job?.kind === 'asr' ? (
          <AiProgress job={job} onCancel={() => api.aiCancel()} />
        ) : (
          <button className="primary block" onClick={generate} disabled={busy || !project.clips.length}>
            <Icon name="sparkles" /> {subs.length ? 'Yeniden oluştur' : 'Altyazı oluştur'}
          </button>
        )}
      </StepCard>

      <StepCard n={2} icon="languages" title="Çeviri altyazı (isteğe bağlı)" done={translations.length > 0} disabled={!subs.length && !busy}>
        {!subs.length ? (
          <p className="hint">Önce 1. adımda altyazı oluştur. Sonra başka bir dile çevirip orijinalin altında ya da tek başına gösterebilirsin.</p>
        ) : (
          <>
            <div className="row2">
              <label className="field">
                <span className="field-label">Şu dilden</span>
                <select value={project.subLang || lang} onChange={(e) => s.setProjectFlag({ subLang: e.target.value })} disabled={busy}>
                  {LANGS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Şu dile</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
                  {LANGS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Range label="Çeviri satırında en fazla kelime" value={trWords} min={3} max={14} step={1} onChange={setTrWords} />
            <p className="hint">
              {cached[trKey] ? '✓ Çeviri modeli hazır.' : `Çeviri modeli ilk kullanımda bir kez indirilir (${trSize}).`} İnternete yalnızca indirme için bağlanır.
            </p>
            {job?.kind === 'tr' ? (
              <AiProgress job={job} onCancel={() => api.aiCancel()} />
            ) : (
              <button className="primary block" onClick={translate} disabled={busy}>
                <Icon name="languages" /> {translations.length ? 'Yeniden çevir' : `${langName(target)} diline çevir`}
              </button>
            )}
          </>
        )}
      </StepCard>

      <StepCard n={3} icon="captions" title="Görünüm">
        <div className="toggles">
          <label className={`toggle${project.showSubs !== false ? ' on' : ''}`}>
            <input type="checkbox" checked={project.showSubs !== false} onChange={(e) => s.setProjectFlag({ showSubs: e.target.checked })} />
            Orijinal altyazı
          </label>
          <label className={`toggle${project.showTrans !== false ? ' on' : ''}${!translations.length ? ' off' : ''}`}>
            <input
              type="checkbox"
              disabled={!translations.length}
              checked={translations.length > 0 && project.showTrans !== false}
              onChange={(e) => s.setProjectFlag({ showTrans: e.target.checked })}
            />
            Çeviri
          </label>
        </div>
        <div className="field-label">Hazır stiller</div>
        <div className="sub-presets">
          {SUB_PRESETS.map(([name, st]) => {
            const on = Object.entries(st).every(([k, v]) => subStyle[k] === v);
            return (
              <button key={name} className={`sp${on ? ' on' : ''}`} onClick={() => s.updateSubStyle(st)} title={`${name} stilini uygula`}>
                <span
                  className="sp-prev"
                  style={{
                    fontFamily: st.font,
                    fontWeight: st.fontWeight,
                    color: st.color,
                    background: st.bg === 'box' ? st.boxColor : 'transparent',
                    WebkitTextStroke: st.bg === 'stroke' ? '0.8px #000' : undefined,
                    textShadow: st.bg === 'shadow' ? '0 2px 6px #000' : undefined,
                    textTransform: st.uppercase ? 'uppercase' : 'none',
                  }}
                >
                  {st.highlight === 'reveal' ? 'Bir iki' : 'Bir '}
                  {st.highlight !== 'reveal' && (
                    <b
                      style={{
                        color: ['color', 'pop'].includes(st.highlight) ? st.hlColor : undefined,
                        background: st.highlight === 'box' ? st.hlColor : undefined,
                        fontSize: st.highlight === 'pop' ? '1.15em' : undefined,
                        borderRadius: 3,
                        padding: st.highlight === 'box' ? '0 2px' : 0,
                      }}
                    >
                      iki
                    </b>
                  )}
                </span>
                <small>{name}</small>
              </button>
            );
          })}
        </div>
        <div className="field-label">Konuşulan kelimeyi vurgula</div>
        <Seg
          value={subStyle.highlight || 'none'}
          onChange={(v) => s.updateSubStyle({ highlight: v })}
          options={[['none', 'Yok'], ['color', 'Renkli'], ['pop', 'Büyüyen'], ['box', 'Kutulu'], ['reveal', 'Belirerek']]}
        />
        {subStyle.highlight && !['none', 'reveal'].includes(subStyle.highlight) && (
          <label className="field color inline">
            <span className="field-label">Vurgu rengi</span>
            <input type="color" value={subStyle.hlColor || '#ffd400'} onChange={(e) => s.updateSubStyle({ hlColor: e.target.value }, 'sub-hl')} />
          </label>
        )}
        <div className="field-label">Satır girişi</div>
        <Seg
          value={subStyle.anim || 'none'}
          onChange={(v) => s.updateSubStyle({ anim: v })}
          options={[['none', 'Düz'], ['fade', 'Belir'], ['pop', 'Zıpla'], ['slide', 'Kay']]}
        />
        <button className="accordion" onClick={() => setStyleOpen(styleOpen === 'sub' ? null : 'sub')}>
          <Icon name="chevron" className={styleOpen === 'sub' ? 'rot' : ''} /> Altyazı yazı stili
        </button>
        {styleOpen === 'sub' && <StyleEditor style={subStyle} keyPrefix="sub" onChange={(patch, key) => s.updateSubStyle(patch, key)} />}
        {translations.length > 0 && (
          <>
            <button className="accordion" onClick={() => setStyleOpen(styleOpen === 'tr' ? null : 'tr')}>
              <Icon name="chevron" className={styleOpen === 'tr' ? 'rot' : ''} /> Çeviri yazı stili
            </button>
            {styleOpen === 'tr' && <StyleEditor style={trStyle} keyPrefix="tr" onChange={(patch, key) => s.updateTrStyle(patch, key)} />}
          </>
        )}
      </StepCard>

      <section className="sub-list-wrap">
        <div className="list-head">
          <Seg
            value={list}
            onChange={setList}
            options={[
              ['sub', `Altyazı (${subs.length})`],
              ['tr', `Çeviri (${translations.length})`],
            ]}
          />
        </div>
        <div className="btn-row">
          {list === 'sub' && (
            <button onClick={() => s.addSubtitle()} title="Çubuğun olduğu yere boş altyazı ekle">
              <Icon name="plus" /> Ekle
            </button>
          )}
          <button disabled={!shown.length} onClick={() => exportSrt(shown, list === 'sub' ? 'altyazi.srt' : `ceviri-${project.trLang}.srt`)}>
            <Icon name="download" /> SRT
          </button>
          <button
            className="danger"
            disabled={!shown.length}
            onClick={() => confirm('Bu listedeki tüm satırlar silinsin mi?') && (list === 'sub' ? s.setSubtitles([]) : s.setTranslations([]))}
          >
            <Icon name="trash" /> Temizle
          </button>
        </div>
        {shown.length ? (
          <ul className="sub-list">
            {shown.map((x) => {
              const type = list === 'sub' ? 'sub' : 'tr';
              const active = sel?.type === type && sel.id === x.id;
              return (
                <li key={x.id} className={active ? 'sel' : ''}>
                  <button className="time" onClick={() => (s.select({ type, id: x.id }), player.seek(x.start + 0.01))} title="Bu ana git">
                    {fmtTime(x.start)}
                  </button>
                  <input
                    value={x.text}
                    onFocus={() => (s.select({ type, id: x.id }), player.seek(x.start + 0.01))}
                    onChange={(e) => (type === 'sub' ? s.updateSub : s.updateTr)(x.id, { text: e.target.value }, `${x.id}-text`)}
                  />
                  <button
                    className="x"
                    title="Sil"
                    onClick={() => (type === 'sub' ? s.setSubtitles(subs.filter((y) => y.id !== x.id)) : s.setTranslations(translations.filter((y) => y.id !== x.id)))}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint center">{list === 'sub' ? 'Henüz altyazı yok.' : 'Henüz çeviri yok.'}</p>
        )}
      </section>
    </div>
  );
}
