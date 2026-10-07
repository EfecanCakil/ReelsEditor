import { create } from 'zustand';
import { locate, totalDur } from './timeline.js';
import { defaultColor } from '../shared/color.mjs';

let seq = 0;
export const newId = (p = 'id') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export const FONTS = ['Segoe UI', 'Arial', 'Impact', 'Bahnschrift', 'Georgia', 'Verdana', 'Trebuchet MS', 'Comic Sans MS'];

export const defaultTextStyle = {
  font: 'Segoe UI', fontSize: 84, fontWeight: 800, color: '#ffffff',
  bg: 'stroke', boxColor: '#000000', uppercase: false, x: 0.5, y: 0.3,
};
export const defaultSubStyle = {
  font: 'Segoe UI', fontSize: 68, fontWeight: 800, color: '#ffffff',
  bg: 'stroke', boxColor: '#000000', uppercase: false, x: 0.5, y: 0.72,
  highlight: 'pop', hlColor: '#ffd400',
};
// Çeviri altyazısı: orijinalin altında, daha küçük ve farklı renkte
export const defaultTrStyle = {
  font: 'Segoe UI', fontSize: 52, fontWeight: 700, color: '#ffe066',
  bg: 'stroke', boxColor: '#000000', uppercase: false, x: 0.5, y: 0.83,
};

const emptyProject = (format = '9:16') => ({
  version: 2,
  format,
  media: {},
  clips: [],
  texts: [],
  subtitles: [],
  subStyle: { ...defaultSubStyle },
  subLang: 'turkish',
  translations: [],
  trStyle: { ...defaultTrStyle },
  trLang: 'english',
  showSubs: true,
  showTrans: true,
  fadeIn: false,
  fadeOut: false,
  music: null,
});

export const noTransition = () => ({ type: 'none', duration: 0.5 });

const makeClip = (mediaId, m) => ({
  id: newId('c'), mediaId, in: 0, out: m.type === 'image' ? 3 : m.duration,
  volume: 1, muted: false, fit: 'blur', zoom: 1, offX: 0.5, offY: 0.5,
  speed: 1, transition: noTransition(), color: defaultColor(),
});

const listKey = { clip: 'clips', text: 'texts', sub: 'subtitles', tr: 'translations' };

export const useStore = create((set, get) => {
  // Geri alınabilir değişiklik. Aynı key ile ard arda gelen değişiklikler (sürükleme, kaydırıcı) tek adım sayılır.
  const apply = (mutate, key) => {
    const s = get();
    const now = Date.now();
    const coalesce = key && key === s._hk && now - s._ht < 800;
    const draft = structuredClone(s.project);
    mutate(draft);
    set({
      project: draft,
      past: coalesce ? s.past : [...s.past.slice(-99), s.project],
      future: [],
      _hk: key || null,
      _ht: now,
      dirty: true,
    });
  };
  const clampTime = () => {
    const T = totalDur(get().project.clips);
    if (get().time > T) set({ time: T });
  };
  const fresh = { past: [], future: [], selection: null, time: 0, playing: false, tab: 'clip', dirty: false };

  return {
    screen: 'home', // 'home' karşılama ekranı | 'editor'
    project: emptyProject(),
    past: [],
    future: [],
    _hk: null,
    _ht: 0,
    time: 0,
    playing: false,
    selection: null,
    tab: 'clip',
    pxPerSec: 40,
    projectPath: null,
    dirty: false,
    toast: null,
    exportOpen: false,
    helpOpen: false,

    apply,
    setUI: (patch) => set(patch),
    notify: (msg, kind = 'info') => set({ toast: { msg, kind, id: Date.now() } }),
    select: (selection, tab) => set(tab ? { selection, tab } : { selection }),

    undo() {
      const { past, future, project } = get();
      if (!past.length) return;
      set({ project: past.at(-1), past: past.slice(0, -1), future: [project, ...future], _hk: null });
      clampTime();
    },
    redo() {
      const { past, future, project } = get();
      if (!future.length) return;
      set({ project: future[0], future: future.slice(1), past: [...past, project], _hk: null });
      clampTime();
    },

    newProject: (format = '9:16') => set({ ...fresh, project: emptyProject(format), projectPath: null, screen: 'editor' }),
    loadProject: (data, path) => {
      const base = emptyProject(data.format);
      set({
        ...fresh,
        project: {
          ...base,
          ...data,
          subStyle: { ...defaultSubStyle, ...data.subStyle },
          trStyle: { ...defaultTrStyle, ...data.trStyle },
          translations: data.translations || [],
        },
        projectPath: path,
        screen: 'editor',
      });
    },
    goHome: () => set({ screen: 'home', playing: false, exportOpen: false }),

    setFormat: (format) => apply((p) => void (p.format = format)),

    addMedia(items, toTimeline = true) {
      apply((p) => {
        for (const m of items) {
          const id = newId('m');
          p.media[id] = { ...m, id };
          if (toTimeline) p.clips.push(makeClip(id, m));
        }
      });
    },
    addClip: (mediaId) => apply((p) => void p.clips.push(makeClip(mediaId, p.media[mediaId]))),
    removeMedia: (mediaId) =>
      apply((p) => {
        delete p.media[mediaId];
        p.clips = p.clips.filter((c) => c.mediaId !== mediaId);
      }),

    updateClip: (id, patch, key) =>
      apply((p) => {
        const c = p.clips.find((c) => c.id === id);
        if (c) Object.assign(c, patch);
      }, key),
    updateAllClips: (patch) => apply((p) => p.clips.forEach((c) => Object.assign(c, patch))),

    splitAt(T) {
      const loc = locate(get().project.clips, T);
      if (!loc) return;
      const cut = loc.local;
      if (cut - loc.clip.in < 0.05 || loc.clip.out - cut < 0.05) return get().notify('Parçanın kenarına çok yakın; biraz içeriden kesin.', 'warn');
      const newClipId = newId('c');
      apply((p) => {
        const i = p.clips.findIndex((c) => c.id === loc.clip.id);
        const a = p.clips[i];
        p.clips.splice(i + 1, 0, { ...a, id: newClipId, in: cut, transition: noTransition() });
        a.out = cut;
      });
      set({ selection: { type: 'clip', id: newClipId } });
    },

    moveClip: (id, toIndex) =>
      apply((p) => {
        const i = p.clips.findIndex((c) => c.id === id);
        if (i < 0) return;
        const [c] = p.clips.splice(i, 1);
        p.clips.splice(Math.max(0, Math.min(toIndex, p.clips.length)), 0, c);
      }),
    duplicateClip(id) {
      const newClipId = newId('c');
      apply((p) => {
        const i = p.clips.findIndex((c) => c.id === id);
        if (i >= 0) p.clips.splice(i + 1, 0, { ...structuredClone(p.clips[i]), id: newClipId, transition: noTransition() });
      });
      set({ selection: { type: 'clip', id: newClipId } });
    },

    deleteSelection() {
      const sel = get().selection;
      if (!sel) return;
      apply((p) => void (p[listKey[sel.type]] = p[listKey[sel.type]].filter((x) => x.id !== sel.id)));
      set({ selection: null });
      clampTime();
    },

    addText(template) {
      const T = get().time;
      const id = newId('t');
      apply(
        (p) =>
          void p.texts.push({
            id,
            text: template?.text || 'Metninizi yazın',
            start: T,
            end: T + 3,
            style: { ...defaultTextStyle, ...template?.style },
            anim: { in: 'none', out: 'none', ...template?.anim },
          }),
      );
      set({ selection: { type: 'text', id }, tab: 'text' });
    },
    updateText: (id, patch, key) =>
      apply((p) => {
        const t = p.texts.find((t) => t.id === id);
        if (!t) return;
        const { style, ...rest } = patch;
        Object.assign(t, rest);
        if (style) Object.assign(t.style, style);
      }, key),

    addSubtitle() {
      const T = get().time;
      const id = newId('s');
      apply((p) => {
        p.subtitles.push({ id, start: T, end: T + 2, text: 'Altyazı' });
        p.subtitles.sort((a, b) => a.start - b.start);
        p.showSubs = true;
      });
      set({ selection: { type: 'sub', id }, tab: 'subs' });
    },
    updateSub: (id, patch, key) =>
      apply((p) => {
        const s = p.subtitles.find((s) => s.id === id);
        if (s) Object.assign(s, patch);
      }, key),
    setSubtitles: (list, lang) =>
      apply((p) => {
        p.subtitles = list;
        if (lang) p.subLang = lang;
        p.showSubs = true;
      }),
    updateSubStyle: (patch, key) => apply((p) => void Object.assign(p.subStyle, patch), key),

    setTranslations: (list, lang) =>
      apply((p) => {
        p.translations = list;
        if (lang) p.trLang = lang;
        p.showTrans = true;
      }),
    updateTr: (id, patch, key) =>
      apply((p) => {
        const s = p.translations.find((s) => s.id === id);
        if (s) Object.assign(s, patch);
      }, key),
    updateTrStyle: (patch, key) => apply((p) => void Object.assign(p.trStyle, patch), key),
    setProjectFlag: (patch) => apply((p) => void Object.assign(p, patch)),

    setMusic: (m) => apply((p) => void (p.music = m ? { ...m, volume: 0.35, offset: 0, duck: true } : null)),
    replaceClips: (fn) => apply((p) => void (p.clips = fn(p.clips))),
    updateMusic: (patch, key) => apply((p) => p.music && Object.assign(p.music, patch), key),
  };
});
