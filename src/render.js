import { frameGeom, coverSize } from '../shared/geom.mjs';
import { isIdentity, svgMatrixValues } from '../shared/color.mjs';
import { subWordTimes, wordIndexAt } from './timeline.js';

// Tüm koordinatlar çıktı çözünürlüğündedir (örn. 1080×1920).

const srcSize = (s) => [s.videoWidth || s.naturalWidth || 0, s.videoHeight || s.naturalHeight || 0];

// Renk ayarı varsa Preview içindeki SVG filtresine başvur. Kimlik değerlere göre değişir ki
// tarayıcı eski filtreyi önbellekten kullanmasın.
export function colorFilterId(clip) {
  const v = svgMatrixValues(clip.color);
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
  return `cf-${clip.id}-${(h >>> 0).toString(36)}`;
}
const colorFilter = (clip) => (isIdentity(clip.color) ? '' : `url(#${colorFilterId(clip)})`);

// Tek bir klibin karesini (video veya fotoğraf) kadraj ve renk ayarlarıyla çizer
export function drawClipLayer(ctx, W, H, src, clip, blurCanvas) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!src || !clip) return;
  const [vw, vh] = srcSize(src);
  if (!vw || !vh) return;
  const cf = colorFilter(clip);
  if (clip.fit === 'blur') {
    const bw = Math.round(W / 16);
    const bh = Math.round(H / 16);
    if (blurCanvas.width !== bw) blurCanvas.width = bw;
    if (blurCanvas.height !== bh) blurCanvas.height = bh;
    const b = blurCanvas.getContext('2d');
    const cs = coverSize(bw, bh, vw, vh);
    b.filter = `blur(2px) ${cf}`;
    b.drawImage(src, (bw - cs.w) / 2, (bh - cs.h) / 2, cs.w, cs.h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurCanvas, 0, 0, W, H);
  }
  const g = frameGeom(W, H, vw, vh, clip);
  ctx.filter = cf || 'none';
  ctx.drawImage(src, g.x, g.y, g.sw, g.sh);
  ctx.filter = 'none';
}

// ---- Metin animasyonları ----
export const IN_DUR = 0.35;
export const OUT_DUR = 0.3;
export const SUB_IN = 0.2;
export const typeDur = (n) => Math.min(1.6, 0.18 * n + 0.1);
const ease = (p) => 1 - Math.pow(1 - p, 3);
const back = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);

// Giriş/çıkış animasyonunun T anındaki etkisi: saydamlık, ölçek, dikey kayma, daktilo için görünen kelime sayısı
export function fxFor(inKind, outKind, start, end, time, fs, nWords, inDur = IN_DUR) {
  const ti = time - start;
  const to = end - time;
  const fx = { alpha: 1, scale: 1, dy: 0, reveal: null };
  if (inKind === 'type') {
    const d = typeDur(nWords);
    if (ti < d) fx.reveal = Math.min(nWords - 1, Math.floor((Math.max(0, ti) / d) * nWords));
  } else if (inKind && inKind !== 'none' && ti < inDur) {
    const p = Math.max(0, ti) / inDur;
    if (inKind === 'fade') fx.alpha = ease(p);
    if (inKind === 'pop') (fx.alpha = Math.min(1, p * 2.5), (fx.scale = 0.5 + 0.5 * back(p)));
    if (inKind === 'slide') (fx.alpha = ease(p), (fx.dy = (1 - ease(p)) * fs * 0.8));
  }
  if (outKind === 'fade' && to < OUT_DUR) fx.alpha *= Math.max(0, to / OUT_DUR);
  return fx;
}
const fxKey = (fx) => (fx.alpha === 1 && fx.scale === 1 && !fx.dy && fx.reveal == null ? '' : `~${fx.alpha.toFixed(2)},${fx.scale.toFixed(2)},${Math.round(fx.dy)},${fx.reveal}`);
const wordCount = (t) => String(t).split(/\s+/).filter(Boolean).length;

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const maskCanvas = document.createElement('canvas');

// Geçiş: a giden, b gelen klip katmanı; p 0→1.
// Yumuşak geçişler ffmpeg xfade formüllerinin aynısıdır (orada ilerleme pf = 1 - p, 1'den 0'a iner).
export function composite(ctx, W, H, a, b, type, p) {
  const pf = 1 - p;
  const draw = (img, x = 0, y = 0) => ctx.drawImage(img, x, y, W, H);
  const clipped = (path) => {
    ctx.save();
    ctx.beginPath();
    path();
    ctx.clip();
    draw(b);
    ctx.restore();
  };
  ctx.save();
  switch (type) {
    case 'fade':
      draw(a);
      ctx.globalAlpha = p;
      draw(b);
      break;
    case 'none':
      draw(b);
      break;
    case 'fadeblack':
    case 'fadewhite': {
      // out = pf·mix(A, renk, s1) + (1-pf)·mix(renk, B, s2) → ağırlıklı toplam
      const s1 = smoothstep(0.8, 1, pf);
      const s2 = smoothstep(0.2, 1, pf);
      const wA = pf * s1;
      const wB = (1 - pf) * (1 - s2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      if (type === 'fadewhite') {
        ctx.fillStyle = `rgba(255,255,255,${1 - wA - wB})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = wA;
      draw(a);
      ctx.globalAlpha = wB;
      draw(b);
      break;
    }
    case 'slideleft':
      draw(a, -p * W);
      draw(b, (1 - p) * W);
      break;
    case 'slideright':
      draw(a, p * W);
      draw(b, -(1 - p) * W);
      break;
    case 'slideup':
      draw(a, 0, -p * H);
      draw(b, 0, (1 - p) * H);
      break;
    case 'slidedown':
      draw(a, 0, p * H);
      draw(b, 0, -(1 - p) * H);
      break;
    case 'wipeleft':
      draw(a);
      clipped(() => ctx.rect((1 - p) * W, 0, p * W, H));
      break;
    case 'wiperight':
      draw(a);
      clipped(() => ctx.rect(0, 0, p * W, H));
      break;
    case 'circleopen': {
      // B'nin görünürlüğü: 1 - smoothstep(0, 1, d/z + 3(pf - 0.5)), d merkeze uzaklık, z köşegenin yarısı
      draw(a);
      const mw = b.width;
      const mh = b.height;
      if (maskCanvas.width !== mw) maskCanvas.width = mw;
      if (maskCanvas.height !== mh) maskCanvas.height = mh;
      const m = maskCanvas.getContext('2d');
      m.globalCompositeOperation = 'source-over';
      m.clearRect(0, 0, mw, mh);
      m.drawImage(b, 0, 0);
      const z = Math.hypot(mw / 2, mh / 2);
      const g = m.createRadialGradient(mw / 2, mh / 2, 0, mw / 2, mh / 2, z);
      for (let i = 0; i <= 16; i++) {
        const r = i / 16;
        g.addColorStop(r, `rgba(0,0,0,${1 - smoothstep(0, 1, r + 3 * (pf - 0.5))})`);
      }
      m.globalCompositeOperation = 'destination-in';
      m.fillStyle = g;
      m.fillRect(0, 0, mw, mh);
      ctx.drawImage(maskCanvas, 0, 0, W, H);
      break;
    }
    case 'zoomin': {
      // A, merkezden 1/zf kat büyüyerek B'ye karışır
      draw(b);
      const zf = Math.max(0.002, smoothstep(0.5, 1, pf));
      const s = 1 / zf;
      ctx.globalAlpha = smoothstep(0, 0.5, pf);
      ctx.drawImage(a, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
      break;
    }
    default:
      draw(b);
  }
  ctx.restore();
}

/**
 * Metni kelime kelime yerleştirip çizer. hl: { index, mode, color } kelime vurgusu (altyazı için)
 * mode: 'color' renkli kelime | 'box' kutulu kelime | 'pop' büyüyen kelime | 'reveal' kelime kelime belir
 */
export function drawText(ctx, W, H, raw, style, hl, fx) {
  if (fx && fx.reveal != null && !hl) hl = { mode: 'reveal', index: fx.reveal };
  ctx.save();
  ctx.font = `${style.fontWeight} ${style.fontSize}px "${style.font}", "Segoe UI", Arial, sans-serif`;
  const fs = style.fontSize;
  const lh = fs * 1.22;
  const maxW = W * 0.86;
  // Büyüyen vurguda kelime komşularına taşmasın diye boşluk biraz geniş tutulur (yerleşim sabit kalır)
  const space = ctx.measureText(' ').width + (hl?.mode === 'pop' ? fs * 0.14 : 0);

  // Kelimeleri satırlara dağıt
  const lines = [];
  let wi = 0;
  for (const para of String(raw).split('\n')) {
    let line = { words: [], width: 0 };
    for (const tok of para.split(/\s+/).filter(Boolean)) {
      const text = style.uppercase ? tok.toLocaleUpperCase('tr-TR') : tok;
      const w = ctx.measureText(text).width;
      const nw = line.words.length ? line.width + space + w : w;
      if (line.words.length && nw > maxW) {
        lines.push(line);
        line = { words: [], width: 0 };
      }
      line.width = line.words.length ? line.width + space + w : w;
      line.words.push({ text, w, i: wi++ });
    }
    lines.push(line);
  }

  const top = style.y * H - (lines.length * lh) / 2;
  const cx = style.x * W;
  const padX = fs * 0.35;
  const maxLineW = Math.max(1, ...lines.map((l) => l.width));
  if (fx && (fx.alpha !== 1 || fx.scale !== 1 || fx.dy)) {
    const cy = style.y * H;
    ctx.globalAlpha *= fx.alpha;
    ctx.translate(cx, cy + fx.dy);
    ctx.scale(fx.scale, fx.scale);
    ctx.translate(-cx, -cy);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  if (style.bg === 'box') {
    ctx.fillStyle = style.boxColor;
    lines.forEach((l, i) => {
      if (!l.words.length) return;
      ctx.beginPath();
      ctx.roundRect(cx - l.width / 2 - padX, top + lh * i, l.width + padX * 2, lh, fs * 0.2);
      ctx.fill();
    });
  }
  if (style.bg === 'shadow') {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = fs * 0.25;
    ctx.shadowOffsetY = fs * 0.05;
  }

  // Arapça/Farsça/İbranice sağdan sola yazılır: satırdaki kelime sırası görsel olarak ters çizilir
  const rtl = /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(raw);
  lines.forEach((l, li) => {
    const y = top + lh * li + lh / 2;
    let x = cx - l.width / 2;
    for (const w of rtl ? [...l.words].reverse() : l.words) {
      const cur = hl && w.i === hl.index;
      const hidden = hl?.mode === 'reveal' && w.i > hl.index;
      if (!hidden) {
        ctx.save();
        if (cur && hl.mode === 'box') {
          ctx.fillStyle = hl.color;
          ctx.beginPath();
          ctx.roundRect(x - fs * 0.14, y - lh / 2 + fs * 0.04, w.w + fs * 0.28, lh - fs * 0.08, fs * 0.16);
          ctx.fill();
        }
        if (cur && hl.mode === 'pop') {
          ctx.translate(x + w.w / 2, y);
          ctx.scale(1.14, 1.14);
          ctx.translate(-(x + w.w / 2), -y);
        }
        if (style.bg === 'stroke') {
          ctx.lineWidth = fs * 0.16;
          ctx.strokeStyle = style.boxColor;
          ctx.strokeText(w.text, x, y);
        }
        ctx.fillStyle = cur && (hl.mode === 'color' || hl.mode === 'pop') ? hl.color : style.color;
        ctx.fillText(w.text, x, y);
        ctx.restore();
      }
      x += w.w + space;
    }
  });
  ctx.restore();

  const pad = style.bg === 'box' ? padX : fs * 0.1;
  return { x: cx - maxLineW / 2 - pad, y: top, w: maxLineW + pad * 2, h: lines.length * lh };
}

// T anında görünen metin ve altyazılar. key: dışa aktarmada aynı görüntüleri tekrar üretmemek için
export function activeOverlays(project, time) {
  const list = project.texts
    .filter((t) => time >= t.start && time < t.end && t.text.trim())
    .map((t) => {
      const fx = fxFor(t.anim?.in, t.anim?.out, t.start, t.end, time, t.style.fontSize, wordCount(t.text));
      return { type: 'text', id: t.id, text: t.text, style: t.style, fx, key: `t:${t.id}${fxKey(fx)}` };
    });
  const subAnim = project.subStyle.anim;
  const sub = project.showSubs !== false && project.subtitles.find((s) => time >= s.start && time < s.end && s.text.trim());
  if (sub) {
    const st = project.subStyle;
    let hl = null;
    if (st.highlight && st.highlight !== 'none') {
      hl = { mode: st.highlight, color: st.hlColor || '#ffd400', index: wordIndexAt(subWordTimes(sub), time) };
    }
    const fx = fxFor(subAnim, null, sub.start, sub.end, time, st.fontSize, 0, SUB_IN);
    list.push({ type: 'sub', id: sub.id, text: sub.text, style: st, hl, fx, key: `s:${sub.id}:${hl ? hl.index : ''}${fxKey(fx)}` });
  }
  const tr = project.showTrans !== false && (project.translations || []).find((s) => time >= s.start && time < s.end && s.text.trim());
  if (tr) {
    const fx = fxFor(subAnim, null, tr.start, tr.end, time, project.trStyle.fontSize, 0, SUB_IN);
    list.push({ type: 'tr', id: tr.id, text: tr.text, style: project.trStyle, fx, key: `r:${tr.id}${fxKey(fx)}` });
  }
  return list;
}

export function drawOverlays(ctx, W, H, project, time, selection) {
  const boxes = activeOverlays(project, time).map((o) => ({ type: o.type, id: o.id, ...drawText(ctx, W, H, o.text, o.style, o.hl, o.fx) }));
  const sel = selection && boxes.find((b) => b.type === selection.type && b.id === selection.id);
  if (sel) {
    ctx.save();
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(sel.x - 10, sel.y - 10, sel.w + 20, sel.h + 20);
    ctx.restore();
  }
  return boxes;
}

/**
 * Dışa aktarma için tüm metin/altyazıları tek bir şeffaf görüntü dizisine çevirir.
 * Dönen: { images: [dataURL], seq: [{ img, dur }] } — her aralıkta ekranda ne varsa o kare.
 */
export async function buildOverlayTrack(project, W, H, total, onProgress) {
  const cuts = new Set([0, total]);
  const add = (t) => t > 0 && t < total && cuts.add(Math.round(t * 1000) / 1000);
  // Animasyonlu aralıklar 30 fps ile kare kare örneklenir
  const sample = (a, d) => {
    for (let k = 0; k <= Math.ceil(d * 30); k++) add(a + k / 30);
  };
  for (const t of project.texts) {
    add(t.start);
    add(t.end);
    const a = t.anim || {};
    if (a.in === 'type') {
      const n = wordCount(t.text);
      for (let k = 1; k < n; k++) add(t.start + (typeDur(n) * k) / n);
    } else if (a.in && a.in !== 'none') sample(t.start, IN_DUR);
    if (a.out === 'fade') sample(t.end - OUT_DUR, OUT_DUR);
  }
  const karaoke = project.subStyle.highlight && project.subStyle.highlight !== 'none';
  const subAnim = project.subStyle.anim && project.subStyle.anim !== 'none';
  for (const s of project.subtitles) {
    add(s.start);
    add(s.end);
    if (karaoke) subWordTimes(s).forEach(([a]) => add(a));
    if (subAnim) sample(s.start, SUB_IN);
  }
  for (const s of project.translations || []) {
    add(s.start);
    add(s.end);
    if (subAnim) sample(s.start, SUB_IN);
  }
  const times = [...cuts].sort((a, b) => a - b);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const images = [];
  const byKey = new Map();
  const seq = [];
  for (let i = 0; i < times.length - 1; i++) {
    const a = times[i];
    const b = times[i + 1];
    if (b - a < 1e-3) continue;
    const act = activeOverlays(project, (a + b) / 2);
    const key = act.map((o) => o.key).join('|');
    if (!byKey.has(key)) {
      ctx.clearRect(0, 0, W, H);
      for (const o of act) drawText(ctx, W, H, o.text, o.style, o.hl, o.fx);
      images.push(c.toDataURL('image/png'));
      byKey.set(key, images.length - 1);
      if (images.length % 10 === 0) {
        onProgress?.(i / times.length);
        await new Promise((r) => setTimeout(r));
      }
    }
    const img = byKey.get(key);
    if (seq.length && seq.at(-1).img === img) seq.at(-1).dur += b - a;
    else seq.push({ img, dur: b - a });
  }
  if (byKey.size === 1 && byKey.has('')) return null;
  return { images, seq };
}
