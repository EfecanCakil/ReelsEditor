import { FONTS } from '../store.js';

export function Range({ label, value, min, max, step = 0.01, onChange, format = (v) => v }) {
  return (
    <label className="field range">
      <span className="field-label">
        {label}
        <b>{format(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({ label, value, step = 0.1, min, max, onChange }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number(value.toFixed(2))}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

const pct = (v) => `${Math.round(v * 100)}%`;

// Metin ve altyazı için ortak stil düzenleyici. key: geri alma birleştirme anahtarı
export function StyleEditor({ style, onChange, keyPrefix }) {
  const set = (k) => (v) => onChange({ [k]: v }, `${keyPrefix}-${k}`);
  return (
    <div className="style-editor">
      <div className="row2">
        <label className="field">
          <span className="field-label">Yazı tipi</span>
          <select value={style.font} onChange={(e) => set('font')(e.target.value)}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Kalınlık</span>
          <select value={style.fontWeight} onChange={(e) => set('fontWeight')(Number(e.target.value))}>
            <option value={400}>Normal</option>
            <option value={600}>Yarı kalın</option>
            <option value={800}>Kalın</option>
            <option value={900}>Siyah</option>
          </select>
        </label>
      </div>
      <Range label="Boyut" value={style.fontSize} min={24} max={220} step={1} onChange={set('fontSize')} format={(v) => `${v}px`} />
      <div className="field">
        <span className="field-label">Arka plan</span>
        <Seg
          value={style.bg}
          onChange={set('bg')}
          options={[['none', 'Yok'], ['stroke', 'Kontur'], ['box', 'Kutu'], ['shadow', 'Gölge']]}
        />
      </div>
      <div className="row2">
        <label className="field color">
          <span className="field-label">Yazı rengi</span>
          <input type="color" value={style.color} onChange={(e) => set('color')(e.target.value)} />
        </label>
        <label className="field color">
          <span className="field-label">Kontur / kutu</span>
          <input type="color" value={style.boxColor} onChange={(e) => set('boxColor')(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={style.uppercase} onChange={(e) => set('uppercase')(e.target.checked)} />
        BÜYÜK HARF
      </label>
      <Range label="Yatay konum" value={style.x} min={0} max={1} onChange={set('x')} format={pct} />
      <Range label="Dikey konum" value={style.y} min={0} max={1} onChange={set('y')} format={pct} />
      <p className="hint">İpucu: Metni önizleme üzerinde sürükleyerek de konumlandırabilirsiniz.</p>
    </div>
  );
}
