// Renk ayarları tek bir renk matrisi olarak hesaplanır. Önizleme bunu SVG feColorMatrix ile,
// dışa aktarma ffmpeg colorchannelmixer + lutrgb ile uygular; ikisi aynı sonucu verir.
// b: parlaklık (çarpan), c: kontrast, s: doygunluk (CSS saturate ile aynı), w: sıcaklık (-1 soğuk … 1 sıcak)

export const COLOR_PRESETS = [
  ['none', 'Orijinal', { b: 1, c: 1, s: 1, w: 0 }],
  ['vivid', 'Canlı', { b: 1.03, c: 1.1, s: 1.35, w: 0.1 }],
  ['cinema', 'Sinema', { b: 0.97, c: 1.18, s: 0.85, w: 0.25 }],
  ['warm', 'Sıcak', { b: 1.02, c: 1.03, s: 1.1, w: 0.6 }],
  ['cool', 'Soğuk', { b: 1, c: 1.05, s: 1, w: -0.6 }],
  ['bright', 'Parlak', { b: 1.12, c: 1.05, s: 1.15, w: 0 }],
  ['faded', 'Soluk', { b: 1.06, c: 0.85, s: 0.75, w: 0.3 }],
  ['bw', 'Siyah-beyaz', { b: 1, c: 1.12, s: 0, w: 0 }],
];

export const defaultColor = () => ({ b: 1, c: 1, s: 1, w: 0 });
export const isIdentity = (col) => !col || (col.b === 1 && col.c === 1 && col.s === 1 && col.w === 0);

export function colorMatrix({ b = 1, c = 1, s = 1, w = 0 } = {}) {
  const S = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  const warm = [1 + 0.12 * w, 1 + 0.02 * w, 1 - 0.12 * w];
  return { m: S.map((row, i) => row.map((v) => v * b * warm[i] * c)), off: 0.5 * (1 - c) };
}

export function svgMatrixValues(col) {
  const { m, off } = colorMatrix(col);
  return `${m.map((r) => [...r.map((n) => n.toFixed(4)), 0, off.toFixed(4)].join(' ')).join(' ')} 0 0 0 1 0`;
}

// ffmpeg filtre zinciri parçası (sonunda virgülle) ya da renk ayarı yoksa boş metin
export function ffmpegColorFilter(col) {
  if (isIdentity(col)) return '';
  const { m, off } = colorMatrix(col);
  const k = ['r', 'g', 'b'];
  const parts = [];
  m.forEach((row, i) => row.forEach((v, j) => parts.push(`${k[i]}${k[j]}=${v.toFixed(4)}`)));
  let f = `colorchannelmixer=${parts.join(':')}`;
  if (Math.abs(off) > 1e-4) {
    const o = (off * 255).toFixed(2);
    f += `,lutrgb=r='clip(val+${o},0,255)':g='clip(val+${o},0,255)':b='clip(val+${o},0,255)'`;
  }
  return `${f},`;
}
