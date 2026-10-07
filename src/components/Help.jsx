import { useStore } from '../store.js';
import Icon from './Icon.jsx';

const GUIDE = [
  ['upload', 'Medya ekle', 'Soldaki “Medya ekle” düğmesi ya da dosyaları pencereye sürükleyip bırak. Eklenenler alttaki zaman çizelgesine sırayla dizilir.'],
  ['scissors', 'Kes', 'Kırmızı çubuğu kesmek istediğin yere getir, “Böl”e bas (S). İstemediğin parçayı seçip “Sil”. Parçanın kenarını sürükleyerek de kısaltabilirsin.'],
  ['wand', 'Boşlukları otomatik kes', 'Konuşmalı videolarda alttaki “Boşlukları kes” düğmesi duraklamaları tek seferde çıkarır. Beğenmezsen Ctrl+Z.'],
  ['transition', 'Sırala ve geçiş ekle', 'Parçaları sürükleyerek sırala. İki parça arasındaki yuvarlak düğmeye basıp geçiş efekti seç.'],
  ['captions', 'Altyazı ve çeviri', 'Sağdaki “Altyazı” sekmesinde “Altyazı oluştur”a bas, hazır stillerden birini seç. İstersen 2. adımda başka bir dile çevir.'],
  ['sparkles', 'Renk, metin ve müzik', 'Parça sekmesinde renk filtresi, Metin sekmesinde animasyonlu şablonlar, Müzik sekmesinde konuşmada otomatik kısma var.'],
  ['download', 'Kaydet', '“Dışa aktar” ile tek video ya da her parçayı ayrı dosya olarak kaydet.'],
];

const KEYS = [
  ['Boşluk', 'Oynat / duraklat'],
  ['S', 'Çubuğun olduğu yerden böl'],
  ['T', 'Metin ekle'],
  ['Delete', 'Seçileni sil'],
  ['← / →', '1 kare geri / ileri (Shift: 1 sn)'],
  ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'],
  ['Ctrl+S', 'Projeyi kaydet'],
  ['Ctrl + tekerlek', 'Zaman çizelgesini yakınlaştır'],
];

export default function Help() {
  const close = () => {
    useStore.setState({ helpOpen: false });
    try {
      localStorage.setItem('reels.helpSeen', '1');
    } catch {}
  };
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal help">
        <button className="icon-btn modal-x" onClick={close} title="Kapat">
          <Icon name="x" />
        </button>
        <h2>Nasıl kullanılır?</h2>
        <ol className="guide">
          {GUIDE.map(([icon, title, desc], i) => (
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
        <h3>Klavye kısayolları</h3>
        <div className="keys">
          {KEYS.map(([k, d]) => (
            <div key={k}>
              <kbd>{k}</kbd>
              <span>{d}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={close}>
            Anladım, başlayalım
          </button>
        </div>
      </div>
    </div>
  );
}
