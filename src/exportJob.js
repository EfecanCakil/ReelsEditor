import { noTransition } from './store.js';
import { layout, speedOf } from './timeline.js';
import { buildOverlayTrack } from './render.js';
import { FORMATS } from '../shared/geom.mjs';

// Ön ayar hız/dosya boyutu dengesi: 8 GB RAM'li dizüstülerde 'veryfast' medium'a göre 2–3 kat hızlıdır
export const QUALITY = {
  high: { crf: 18, preset: 'fast' },
  normal: { crf: 21, preset: 'veryfast' },
  small: { crf: 26, preset: 'veryfast' },
};

export async function buildJob(project, { quality = 'normal', fps = 30, normalize = false, still = null } = {}, output, onPrepare) {
  const F = FORMATS[project.format];
  const L = layout(project.clips);
  const clips = L.map(({ clip: c, dur, tIn }) => {
    const m = project.media[c.mediaId];
    return {
      ...c,
      path: m.path,
      isImage: m.type === 'image',
      width: m.width,
      height: m.height,
      hasAudio: m.hasAudio,
      speed: speedOf(c),
      dur,
      tIn,
      transition: c.transition?.type || 'none',
    };
  });
  const total = L.length ? L.at(-1).end : 0;
  const overlay = await buildOverlayTrack(project, F.w, F.h, total, onPrepare);
  const music = project.music && { path: project.music.path, volume: project.music.volume, offset: project.music.offset, duck: !!project.music.duck };
  return {
    W: F.w,
    H: F.h,
    fps,
    ...QUALITY[quality],
    clips,
    overlay,
    music,
    output,
    fadeIn: !!project.fadeIn,
    fadeOut: !!project.fadeOut,
    normalize,
    still,
  };
}

// Tek bir parçayı, o aralıktaki metin/altyazı/müzikle birlikte bağımsız bir projeye dönüştür
export function sliceProject(project, index) {
  const l = layout(project.clips)[index];
  const { start, end, dur } = l;
  const shift = (arr = []) =>
    arr
      .filter((x) => x.end > start + 0.05 && x.start < end - 0.05)
      .map((x) => {
        const ns = Math.max(0, x.start - start);
        const delta = x.start - start - ns; // baştan kırpıldıysa kelime zamanlarını kaydır
        return {
          ...x,
          start: ns,
          end: Math.min(dur, x.end - start),
          ...(x.words ? { words: x.words.map((w) => ({ s: w.s + delta, e: w.e + delta })) } : {}),
        };
      });
  return {
    ...project,
    clips: [{ ...l.clip, transition: noTransition() }],
    texts: shift(project.texts),
    subtitles: shift(project.subtitles),
    translations: shift(project.translations),
    music: project.music && { ...project.music, offset: (project.music.offset + start) % project.music.duration },
  };
}
