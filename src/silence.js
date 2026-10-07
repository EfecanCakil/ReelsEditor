import { useStore, newId, noTransition } from './store.js';
import { api } from './api.js';

// Hassasiyet: ne kadar sessizse ve en az ne kadar sürerse "boşluk" sayılır; pad: kesimin iki yanında bırakılan pay
export const SILENCE_LEVELS = {
  soft: { label: 'Az', db: -40, min: 0.9, pad: 0.2 },
  normal: { label: 'Normal', db: -35, min: 0.6, pad: 0.15 },
  strong: { label: 'Çok', db: -30, min: 0.35, pad: 0.08 },
};

/**
 * Verilen parçalardaki sessiz bölümleri çıkarır: her parça konuşan bölümlerine ayrılır.
 * Tek bir geri alma adımıdır. Dönen: { cuts, saved } (kaç boşluk kesildi, kaç saniye kısaldı)
 */
export async function cutSilences(clipIds, level = 'normal') {
  const { db, min, pad } = SILENCE_LEVELS[level];
  const s = useStore.getState();
  const { project } = s;
  const replace = new Map();
  let cuts = 0;
  let saved = 0;
  for (const id of clipIds) {
    const c = project.clips.find((x) => x.id === id);
    const m = c && project.media[c.mediaId];
    if (!m || m.type === 'image' || !m.hasAudio) continue;
    const silences = await api.silences(m.path, c.in, c.out, db, min);
    const keep = [];
    let cur = c.in;
    for (const [a, b] of silences) {
      const ka = a + pad;
      const kb = b - pad;
      if (kb - ka < 0.1) continue;
      if (ka - cur > 0.15) keep.push([cur, ka]);
      cur = Math.max(cur, kb);
      cuts++;
    }
    if (c.out - cur > 0.15) keep.push([cur, c.out]);
    if (!keep.length) continue; // tamamen sessiz parçayı silme; kullanıcı karar versin
    const kept = keep.reduce((t, [a, b]) => t + (b - a), 0);
    if (c.out - c.in - kept < 0.05) continue;
    saved += (c.out - c.in - kept) / (c.speed || 1);
    replace.set(
      id,
      keep.map(([a, b], i) => ({ ...c, id: i ? newId('c') : c.id, in: a, out: b, transition: i ? noTransition() : c.transition })),
    );
  }
  if (replace.size) s.replaceClips((clips) => clips.flatMap((c) => replace.get(c.id) || [c]));
  return { cuts, saved };
}
