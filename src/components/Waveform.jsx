import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Dosya başına bir kez hesaplanır, bellekte tutulur (projeye kaydedilmez)
const cache = new Map();

function useWave(path) {
  const [wave, setWave] = useState(() => cache.get(path));
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let p = cache.get(path);
    if (!p) {
      p = api.waveform(path);
      cache.set(path, p);
    }
    Promise.resolve(p).then((w) => {
      cache.set(path, w);
      if (alive) setWave(w);
    });
    return () => (alive = false);
  }, [path]);
  return wave instanceof Promise ? null : wave;
}

// Parçanın [in, out] aralığındaki ses dalgası; genişliğe göre seyreltilmiş SVG yolu
export default function Waveform({ path, from, to, width, height = 26 }) {
  const wave = useWave(path);
  if (!wave?.peaks?.length || width < 8) return null;
  const { perSec, peaks } = wave;
  const a = Math.floor(from * perSec);
  const b = Math.min(peaks.length, Math.ceil(to * perSec));
  const n = b - a;
  if (n <= 1) return null;
  const cols = Math.max(2, Math.min(n, Math.floor(width / 2)));
  let d = '';
  for (let i = 0; i < cols; i++) {
    const s = a + Math.floor((i * n) / cols);
    const e = a + Math.floor(((i + 1) * n) / cols);
    let mx = 0;
    for (let j = s; j < Math.max(e, s + 1); j++) mx = Math.max(mx, peaks[j] || 0);
    const h = Math.max(0.5, Math.sqrt(mx) * height); // karekök: kısık sesler de görünsün
    const x = (i / cols) * width;
    d += `M${x.toFixed(1)} ${(height - h).toFixed(1)}V${height}`;
  }
  return (
    <svg className="wave" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={d} strokeWidth={Math.max(1, (width / cols) * 0.7)} />
    </svg>
  );
}
