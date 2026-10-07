import { useStore } from './store.js';
import { layout, totalDur, activeAt, localTime, speedOf } from './timeline.js';
import { drawClipLayer, composite, drawOverlays } from './render.js';
import { mediaUrl } from './api.js';
import { FORMATS } from '../shared/geom.mjs';

const PREVIEW_SCALE = 0.5;
const now = () => performance.now() / 1000;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const canvas = () => document.createElement('canvas');

/**
 * Zaman çizelgesi oynatıcısı. Saat (clock) ana kaynaktır; iki <video> "deck" ona senkronlanır.
 * Biri o an görünen klibi oynatırken diğeri sıradakini önceden yükler; geçişlerde ikisi birlikte oynar.
 */
class Player {
  videos = [];
  decks = [{ clipId: null }, { clipId: null }];
  music = null;
  canvas = null;
  blur = canvas();
  layers = [canvas(), canvas()];
  images = new Map();
  boxes = [];
  raf = 0;
  baseT = 0;
  baseNow = 0;
  stalled = false;
  drawn = false;

  get s() {
    return useStore.getState();
  }

  attach(videos, music, cnv) {
    this.videos = videos;
    this.music = music;
    this.canvas = cnv;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    this.seek(this.s.time);
  }
  detach() {
    cancelAnimationFrame(this.raf);
  }

  image(path) {
    let im = this.images.get(path);
    if (!im) {
      im = new Image();
      im.src = mediaUrl(path);
      this.images.set(path, im);
    }
    return im;
  }

  seek(T) {
    T = Math.max(0, Math.min(T, totalDur(this.s.project.clips)));
    useStore.setState({ time: T });
    this.baseT = T;
    this.baseNow = now();
    this.sync(true);
    this.syncMusic(T);
  }

  play() {
    const { project, time } = this.s;
    const total = totalDur(project.clips);
    if (!total) return;
    useStore.setState({ playing: true });
    this.seek(time >= total - 0.05 ? 0 : time);
  }
  pause() {
    useStore.setState({ playing: false });
    this.videos.forEach((v) => v.pause());
    this.music?.pause();
  }
  toggle() {
    this.s.playing ? this.pause() : this.play();
  }

  syncMusic(T) {
    const a = this.music;
    if (!a) return;
    const m = this.s.project.music;
    if (!m) {
      a.pause();
      if (a.dataset.src) {
        a.removeAttribute('src');
        a.dataset.src = '';
        a.load();
      }
      return;
    }
    const url = mediaUrl(m.path);
    if (a.dataset.src !== url) {
      a.dataset.src = url;
      a.src = url;
    }
    a.volume = Math.min(1, m.volume);
    a.currentTime = (m.offset + T) % m.duration;
    if (this.s.playing && !this.stalled) a.play().catch(() => {});
    else a.pause();
  }

  // Video deck'lerini o anki zamana göre ayarla
  sync(hard) {
    const { project, time: T, playing } = this.s;
    const L = layout(project.clips);
    const act = activeAt(L, T);
    const isVideo = (l) => project.media[l.clip.mediaId] && project.media[l.clip.mediaId].type !== 'image';
    const next = L.find((l) => l.start > T && l.start - T < 1.5 && isVideo(l));
    const wanted = [...act.filter(isVideo), ...(next ? [next] : [])].slice(0, 2);
    const ids = wanted.map((w) => w.clip.id);
    this.decks.forEach((d, i) => {
      if (d.clipId && !ids.includes(d.clipId)) {
        d.clipId = null;
        this.videos[i]?.pause();
      }
    });

    let stalled = false;
    for (const w of wanted) {
      let i = this.decks.findIndex((d) => d.clipId === w.clip.id);
      if (i < 0) i = this.decks.findIndex((d) => !d.clipId);
      const v = this.videos[i];
      if (!v) continue;
      this.decks[i].clipId = w.clip.id;
      const url = mediaUrl(project.media[w.clip.mediaId].path);
      if (v.dataset.src !== url) {
        v.dataset.src = url;
        v.src = url;
      }
      if (v.error) continue;
      const speed = speedOf(w.clip);
      if (v.playbackRate !== speed) v.playbackRate = speed;
      const isActive = act.includes(w);
      // Geçiş sırasında sesleri karıştır
      let g = 1;
      if (isActive && w.tIn > 0 && T < w.start + w.tIn) g = (T - w.start) / w.tIn;
      if (isActive && w.tOut > 0 && T > w.end - w.tOut) g = Math.min(g, (w.end - T) / w.tOut);
      v.volume = clamp01(w.clip.muted ? 0 : w.clip.volume * g);

      const desired = localTime(w, Math.max(T, w.start));
      const drift = Math.abs(v.currentTime - desired);
      if (isActive && playing) {
        const atEnd = v.ended || (v.duration && v.currentTime >= v.duration - 0.1);
        if ((v.readyState < 3 || v.seeking) && !atEnd) stalled = true;
        if (hard || (!v.seeking && drift > 0.3)) v.currentTime = desired;
        if (v.paused && !v.ended) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (hard || (!v.seeking && drift > 0.03)) v.currentTime = desired;
      }
    }
    if (this.stalled !== stalled) {
      this.stalled = stalled;
      if (stalled) this.music?.pause();
      else this.syncMusic(T);
    }
  }

  // Dışa aktarma sırasında önizlemeyi tamamen durdur: CPU'nun tamamı ffmpeg'e kalsın
  suspend(on) {
    this.suspended = on;
    if (on) this.pause();
    else this.drawn = false;
  }

  tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.suspended) return;
    const st = this.s;
    if (st.playing) {
      if (this.stalled) {
        // Video veri beklerken saati dondur
        this.baseT = st.time;
        this.baseNow = now();
      } else {
        const total = totalDur(st.project.clips);
        let T = this.baseT + (now() - this.baseNow);
        // Oynayan bir video varsa saati ona bağla; böylece altyazı/metin sesle tam eşleşir
        const vt = this.videoClock(st);
        if (vt != null && vt > st.time - 0.5) {
          T = Math.max(vt, st.time);
          this.baseT = T;
          this.baseNow = now();
        }
        if (T >= total) {
          T = total;
          this.pause();
        }
        if (T !== st.time) useStore.setState({ time: T });
      }
    }
    this.sync(false);
    this.updateMusicVolume();
    this.draw();
  };

  // Müzik sesi; "konuşmada kıs" açıksa altyazı olan yerlerde ~11 dB (×0.28) kısılır (dışa aktarmada gerçek ses analiziyle yapılır)
  updateMusicVolume() {
    const { project, time } = this.s;
    const m = project.music;
    if (!m || !this.music) return;
    const speaking = m.duck && project.subtitles.some((s) => time >= s.start && time < s.end);
    const target = Math.min(1, m.volume * (speaking ? 0.28 : 1));
    const v = this.music.volume;
    this.music.volume = v + (target - v) * 0.15; // yumuşak geçiş
  }

  videoClock(st) {
    for (const l of activeAt(layout(st.project.clips), st.time)) {
      const v = this.videos[this.decks.findIndex((d) => d.clipId === l.clip.id)];
      if (v && !v.paused && !v.seeking && !v.ended && v.readyState >= 3) {
        return l.start + (v.currentTime - l.clip.in) / speedOf(l.clip);
      }
    }
    return null;
  }

  source(l) {
    const m = this.s.project.media[l.clip.mediaId];
    if (!m) return { ok: true, src: null };
    if (m.type === 'image') {
      const im = this.image(m.path);
      return { ok: im.complete, src: im.naturalWidth ? im : null };
    }
    const v = this.videos[this.decks.findIndex((d) => d.clipId === l.clip.id)];
    if (!v) return { ok: false };
    if (v.error) return { ok: true, src: null };
    return { ok: v.readyState >= 2, src: v };
  }

  draw() {
    const c = this.canvas;
    if (!c) return;
    const { project, time, selection } = this.s;
    const F = FORMATS[project.format];
    const cw = Math.round(F.w * PREVIEW_SCALE);
    const ch = Math.round(F.h * PREVIEW_SCALE);
    for (const k of [c, ...this.layers]) {
      if (k.width !== cw || k.height !== ch) {
        k.width = cw;
        k.height = ch;
      }
    }
    // Durdurulmuşken hiçbir şey değişmediyse yeniden çizme (boşta CPU harcamasın)
    let loadedImages = 0;
    for (const im of this.images.values()) if (im.complete) loadedImages++;
    const sig = [project, time, selection, cw, loadedImages, this.colorDefsVersion, ...this.videos.map((v) => `${v.currentTime}:${v.readyState}:${v.seeking}`)];
    if (!this.s.playing && this.lastSig?.length === sig.length && sig.every((x, i) => x === this.lastSig[i])) return;
    this.lastSig = sig;

    const act = activeAt(layout(project.clips), time);
    const srcs = act.map((l) => this.source(l));
    if (srcs.some((s) => !s.ok) && this.drawn) return; // yüklenirken son kareyi koru

    const ctx = c.getContext('2d');
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    if (act.length === 2) {
      act.forEach((l, i) => {
        const lc = this.layers[i].getContext('2d');
        lc.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
        drawClipLayer(lc, F.w, F.h, srcs[i].src, l.clip, this.blur);
      });
      const p = clamp01((time - act[1].start) / act[1].tIn);
      composite(ctx, F.w, F.h, this.layers[0], this.layers[1], act[1].clip.transition.type, p);
    } else {
      drawClipLayer(ctx, F.w, F.h, srcs[0]?.src, act[0]?.clip, this.blur);
    }
    this.boxes = drawOverlays(ctx, F.w, F.h, project, time, selection);
    // Başta karardan açılma / sonda kararma (dışa aktarmadaki ffmpeg fade ile aynı süre)
    const total = totalDur(project.clips);
    const FADE = Math.min(0.6, total / 4);
    let dark = 0;
    if (project.fadeIn && time < FADE) dark = 1 - time / FADE;
    if (project.fadeOut && time > total - FADE) dark = Math.max(dark, 1 - (total - time) / FADE);
    if (dark > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, dark)})`;
      ctx.fillRect(0, 0, F.w, F.h);
    }
    this.drawn = true;
  }
}

export const player = new Player();
