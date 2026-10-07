export const speedOf = (c) => c.speed || 1;
export const clipDur = (c) => Math.max(0, (c.out - c.in) / speedOf(c));
export const hasTrans = (c) => !!c.transition && c.transition.type !== 'none';

// Klip yerleşimi. Geçişli klipler bir öncekiyle tIn kadar üst üste biner.
export function layout(clips) {
  const out = [];
  clips.forEach((clip, index) => {
    const dur = clipDur(clip);
    const prev = out[index - 1];
    const tIn = prev && hasTrans(clip) ? Math.min(clip.transition.duration, prev.dur / 2, dur / 2) : 0;
    const start = prev ? prev.end - tIn : 0;
    if (prev) prev.tOut = tIn;
    out.push({ clip, index, start, end: start + dur, dur, tIn, tOut: 0 });
  });
  return out;
}

export const totalDur = (clips) => {
  const L = layout(clips);
  return L.length ? L.at(-1).end : 0;
};

// Zaman çizelgesindeki T anının klibin kaynak videosundaki karşılığı
export const localTime = (l, T) => l.clip.in + Math.min(Math.max(T - l.start, 0), l.dur) * speedOf(l.clip);

// T anında görünen klipler (geçiş sırasında 2 tane)
export function activeAt(L, T) {
  const a = L.filter((l) => T >= l.start && T < l.end);
  if (!a.length && L.length && T >= L.at(-1).end - 1e-6) return [L.at(-1)];
  return a;
}

// Düzenleme için T anındaki klip (geçişte gelen klip tercih edilir)
export function locate(clips, T) {
  const L = layout(clips);
  if (!L.length) return null;
  const a = activeAt(L, T);
  const hit = a.at(-1) || (T < 0 ? L[0] : L.at(-1));
  return { ...hit, local: localTime(hit, T) };
}

export function fmtTime(t, precise = true) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}${precise ? '.' + d : ''}`;
}

export function srtTime(t) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
}

// Altyazının kelime zamanları: Whisper'dan geldiyse onlar, metin elle değiştiyse harf sayısına göre tahmin
export function subWordTimes(sub) {
  const tokens = String(sub.text).split(/\s+/).filter(Boolean);
  if (sub.words?.length === tokens.length) return sub.words.map((w) => [sub.start + w.s, sub.start + w.e]);
  const chars = tokens.reduce((a, t) => a + t.length + 1, 0) || 1;
  let t = sub.start;
  return tokens.map((tok) => {
    const d = ((sub.end - sub.start) * (tok.length + 1)) / chars;
    const r = [t, t + d];
    t += d;
    return r;
  });
}

export function wordIndexAt(times, T) {
  let idx = 0;
  for (let i = 0; i < times.length; i++) if (T >= times[i][0]) idx = i;
  return idx;
}
