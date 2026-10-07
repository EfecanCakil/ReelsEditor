// Önizleme (canvas) ve dışa aktarma (ffmpeg) aynı hesapları kullanır; böylece görüntü birebir aynı olur.

export const FORMATS = {
  '9:16': { w: 1080, h: 1920, label: 'Reels / TikTok / Shorts (9:16)' },
  '4:5': { w: 1080, h: 1350, label: 'Instagram gönderi (4:5)' },
  '1:1': { w: 1080, h: 1080, label: 'Kare (1:1)' },
  '16:9': { w: 1920, h: 1080, label: 'YouTube yatay (16:9)' },
};

const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const ceilEven = (v) => Math.max(2, Math.ceil(v / 2) * 2);

// Klibin W×H kare içine yerleşimi. fit: 'fill' (kırparak doldur) | 'fit' (siyah kenar) | 'blur' (bulanık arka plan)
export function frameGeom(W, H, vw, vh, clip) {
  const cover = Math.max(W / vw, H / vh);
  const contain = Math.min(W / vw, H / vh);
  const s = (clip.fit === 'fill' ? cover : contain) * (clip.zoom || 1);
  const sw = even(vw * s);
  const sh = even(vh * s);
  return {
    sw,
    sh,
    x: Math.round((W - sw) * (clip.offX ?? 0.5)),
    y: Math.round((H - sh) * (clip.offY ?? 0.5)),
  };
}

// Kareyi tamamen kaplayan ölçek (bulanık arka plan için)
export function coverSize(W, H, vw, vh) {
  const s = Math.max(W / vw, H / vh);
  return { w: Math.max(W, ceilEven(vw * s)), h: Math.max(H, ceilEven(vh * s)) };
}

export { even };

// Klipler arası geçişler (isimler ffmpeg xfade ile aynı)
export const TRANSITIONS = [
  ['none', 'Yok'],
  ['fade', 'Çapraz geçiş'],
  ['fadeblack', 'Siyaha geçiş'],
  ['fadewhite', 'Beyaz flaş'],
  ['slideleft', 'Sola kaydır'],
  ['slideright', 'Sağa kaydır'],
  ['slideup', 'Yukarı kaydır'],
  ['slidedown', 'Aşağı kaydır'],
  ['wipeleft', 'Sola sil'],
  ['wiperight', 'Sağa sil'],
  ['circleopen', 'Daire açılış'],
  ['zoomin', 'Yakınlaşarak'],
];
