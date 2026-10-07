import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frameGeom, coverSize, even } from '../shared/geom.mjs';
import { ffmpegColorFilter } from '../shared/color.mjs';

const require = createRequire(import.meta.url);
// Paketlenmiş uygulamada ikili dosyalar app.asar.unpacked içindedir
const unpacked = (p) => p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
export const FFMPEG = unpacked(require('ffmpeg-static'));
export const FFPROBE = unpacked(require('ffprobe-static').path);

export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const isImageFile = (f) => IMAGE_EXT.includes(path.extname(f).slice(1).toLowerCase());
const IMAGE_MAX_DUR = 3600;

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true, ...opts });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim() || `${path.basename(bin)} çıkış kodu ${code}`)),
    );
  });
}

export async function probe(file) {
  const buf = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const info = JSON.parse(buf.toString('utf8'));
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');
  let width = v?.width || 0;
  let height = v?.height || 0;
  const rotation = Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const base = { path: file, name: path.basename(file), width, height, hasVideo: !!v, hasAudio: !!a };
  if (isImageFile(file)) {
    if (!width) throw new Error('Görsel okunamadı');
    return { ...base, type: 'image', duration: IMAGE_MAX_DUR, hasAudio: false };
  }
  const duration = parseFloat(info.format?.duration ?? v?.duration ?? a?.duration ?? '0');
  if (!duration) throw new Error('Süre okunamadı');
  return { ...base, type: v ? 'video' : 'audio', duration };
}

// Medya listesi ve zaman çizelgesi için küçük önizleme resmi (JPEG data URL)
export async function thumbnail(info) {
  try {
    // Tek karelik görsellerde -ss hiç kare üretmez; yalnızca videolarda ileri sar
    const seek = info.type === 'image' ? [] : ['-ss', Math.min(1, info.duration / 3).toFixed(2)];
    const b = await run(FFMPEG, [
      '-hide_banner', '-nostdin', ...seek, '-i', info.path, '-frames:v', '1',
      '-vf', 'scale=240:240:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', 'pipe:1',
    ]);
    return b.length ? `data:image/jpeg;base64,${b.toString('base64')}` : null;
  } catch {
    return null;
  }
}

// atempo tek seferde 0.5–2 aralığını destekler; dışındaki hızlar zincirlenir
function atempo(speed) {
  if (speed === 1) return '';
  const parts = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s /= 0.5;
  }
  parts.push(s);
  return parts.map((p) => `atempo=${p.toFixed(4)}`).join(',') + ',';
}

/**
 * job: { W, H, fps, crf, output,
 *   clips: [{ path, isImage, in, out, dur, tIn, transition, speed, width, height, hasAudio, volume, muted, fit, zoom, offX, offY }],
 *   overlay: { images: [dataURL], seq: [{ img, dur }] } | null,   // tüm metin/altyazılar tek şeffaf görüntü akışı
 *   music: { path, volume, offset } | null }
 */
export async function exportVideo(job, onProgress, signal) {
  const { W, H, fps = 30, crf = 20, preset = 'veryfast', clips, overlay, music, output } = job;
  if (!clips?.length) throw new Error('Zaman çizelgesi boş');
  // Süreleri kare ızgarasına oturt; böylece görüntü ve ses birbirinden kaymaz
  const q = (t) => Math.max(1, Math.round(t * fps)) / fps;
  let end = 0;
  const L = clips.map((c, i) => {
    const D = q(c.dur);
    const tIn = i > 0 && c.tIn > 0 ? Math.min(q(c.tIn), D / 2) : 0;
    const start = i ? end - tIn : 0;
    end = start + D;
    return { ...c, D, tIn, start };
  });
  const total = end;
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reels-'));

  try {
    const args = ['-y', '-hide_banner', '-nostdin'];
    const f = [];
    let n = 0;

    L.forEach((c, i) => {
      const D = c.D.toFixed(4);
      const speed = c.isImage ? 1 : c.speed || 1;
      if (c.isImage) args.push('-loop', '1', '-framerate', String(fps), '-t', D, '-i', c.path);
      else args.push('-ss', c.in.toFixed(3), '-t', (c.out - c.in).toFixed(3), '-i', c.path);
      const vi = n++;
      let src = `[${vi}:v]`;
      if (speed !== 1) {
        f.push(`${src}setpts=(PTS-STARTPTS)/${speed}[sp${i}]`);
        src = `[sp${i}]`;
      }
      const colorF = ffmpegColorFilter(c.color);
      if (colorF) {
        f.push(`${src}${colorF.slice(0, -1)}[cc${i}]`);
        src = `[cc${i}]`;
      }
      let fgSrc = src;
      if (c.fit === 'blur') {
        // Arka planı küçükte bulanıklaştırıp büyütmek hem hızlı hem yumuşak
        const bw = even(W / 4);
        const bh = even(H / 4);
        const cs = coverSize(bw, bh, c.width, c.height);
        f.push(`${src}split=2[bs${i}][fs${i}]`);
        f.push(`[bs${i}]scale=${cs.w}:${cs.h},crop=${bw}:${bh},boxblur=12:2,scale=${W}:${H},setsar=1[bg${i}]`);
        fgSrc = `[fs${i}]`;
      } else {
        f.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${D}[bg${i}]`);
      }
      const g = frameGeom(W, H, c.width, c.height, c);
      f.push(`${fgSrc}scale=${g.sw}:${g.sh},setsar=1[fg${i}]`);
      f.push(
        `[bg${i}][fg${i}]overlay=${g.x}:${g.y}:shortest=1,fps=${fps},format=yuv420p,trim=duration=${D},setpts=PTS-STARTPTS,settb=AVTB[v${i}]`,
      );
      if (!c.isImage && c.hasAudio && !c.muted && c.volume > 0) {
        f.push(
          `[${vi}:a]aformat=sample_rates=48000:channel_layouts=stereo,${atempo(speed)}volume=${c.volume.toFixed(3)},apad,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`,
        );
      } else {
        f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${D}[a${i}]`);
      }
    });

    // Klipleri birleştir: geçiş varsa xfade/acrossfade, yoksa düz ekleme
    let vc = 'v0';
    let ac = 'a0';
    for (let i = 1; i < L.length; i++) {
      const c = L[i];
      if (c.tIn > 0) {
        f.push(`[${vc}][v${i}]xfade=transition=${c.transition}:duration=${c.tIn.toFixed(4)}:offset=${c.start.toFixed(4)}[xv${i}]`);
        f.push(`[${ac}][a${i}]acrossfade=d=${c.tIn.toFixed(4)}:c1=tri:c2=tri[xa${i}]`);
      } else {
        f.push(`[${vc}][${ac}][v${i}][a${i}]concat=n=2:v=1:a=1[xv${i}][xa${i}]`);
      }
      vc = `xv${i}`;
      ac = `xa${i}`;
    }

    if (overlay?.seq?.length) {
      for (const [k, img] of overlay.images.entries()) {
        await fs.promises.writeFile(path.join(tmp, `o${k}.png`), Buffer.from(img.split(',')[1], 'base64'));
      }
      const lines = ['ffconcat version 1.0'];
      for (const s of overlay.seq) lines.push(`file 'o${s.img}.png'`, `duration ${s.dur.toFixed(4)}`);
      lines.push(`file 'o${overlay.seq.at(-1).img}.png'`); // concat demuxer son süreyi ancak tekrarla uygular
      await fs.promises.writeFile(path.join(tmp, 'overlays.txt'), lines.join('\n'), 'utf8');
      args.push('-f', 'concat', '-safe', '0', '-i', 'overlays.txt');
      const oi = n++;
      f.push(`[${oi}:v]format=rgba,setpts=PTS-STARTPTS[ovs]`);
      f.push(`[${vc}][ovs]overlay=0:0:eof_action=pass[vo]`);
      vc = 'vo';
    }

    if (music) {
      args.push('-stream_loop', '-1', '-ss', (music.offset || 0).toFixed(3), '-i', music.path);
      const mi = n++;
      const fade = Math.min(2, total / 4);
      f.push(
        `[${mi}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `volume=${music.volume.toFixed(3)},afade=t=out:st=${(total - fade).toFixed(3)}:d=${fade.toFixed(3)}[mus]`,
      );
      if (music.duck) {
        // Konuşma (videonun kendi sesi) varken müziği otomatik kıs
        f.push(`[${ac}]asplit=2[acm][acs]`);
        // ~11 dB kısma: müzik duyulmaya devam eder ama konuşmayı bastırmaz (ölçülerek ayarlandı)
        f.push(`[mus][acs]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=600[mud]`);
        f.push(`[acm][mud]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]`);
      } else {
        f.push(`[${ac}][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]`);
      }
      ac = 'am';
    }

    // Başta karardan açılma / sonda kararma
    const FADE = Math.min(0.6, total / 4);
    const vFx = [];
    const aFx = [];
    if (job.fadeIn) (vFx.push(`fade=t=in:st=0:d=${FADE}`), aFx.push(`afade=t=in:st=0:d=${FADE}`));
    if (job.fadeOut) {
      vFx.push(`fade=t=out:st=${(total - FADE).toFixed(3)}:d=${FADE}`);
      aFx.push(`afade=t=out:st=${(total - FADE).toFixed(3)}:d=${FADE}`);
    }
    // Sosyal medya standardı ses seviyesi (-14 LUFS)
    if (job.normalize) aFx.push('loudnorm=I=-14:TP=-1.5:LRA=11', 'aresample=48000');
    f.push(`[${vc}]${vFx.length ? vFx.join(',') + ',' : ''}format=yuv420p[vout]`);
    f.push(`[${ac}]${aFx.length ? aFx.join(',') : 'anull'}[aout]`);

    if (job.still != null) {
      // Tek kare: ses kullanılmaz, kare PNG olarak yazılır
      f.push('[aout]anullsink');
      await fs.promises.writeFile(path.join(tmp, 'filter.txt'), f.join(';\n'), 'utf8');
      args.push('-filter_complex_script', 'filter.txt', '-map', '[vout]', '-ss', Math.min(job.still, total - 1 / fps).toFixed(3), '-frames:v', '1', '-update', '1', output);
      await runWithProgress(args, tmp, total, () => {}, signal);
      return;
    }

    // Uzun filtre zincirleri Windows komut satırı sınırını aşmasın diye dosyaya yazılır
    await fs.promises.writeFile(path.join(tmp, 'filter.txt'), f.join(';\n'), 'utf8');
    args.push(
      '-filter_complex_script', 'filter.txt',
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-r', String(fps),
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
      '-t', total.toFixed(3), '-progress', 'pipe:1', '-nostats',
      output,
    );
    await runWithProgress(args, tmp, total, onProgress, signal);
  } catch (err) {
    if (signal?.aborted) fs.promises.rm(output, { force: true }).catch(() => {});
    throw err;
  } finally {
    fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function runWithProgress(args, cwd, total, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { cwd, windowsHide: true });
    let err = '';
    let buf = '';
    const onAbort = () => p.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort);
    p.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
        if (m) onProgress?.({ progress: Math.min(1, Number(m[1]) / 1e6 / total) });
      }
    });
    p.stderr.on('data', (d) => (err = (err + d).slice(-6000)));
    p.on('error', reject);
    p.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) reject(new Error('İptal edildi'));
      else if (code === 0) {
        onProgress?.({ progress: 1 });
        resolve();
      } else reject(new Error(err.trim().split('\n').slice(-8).join('\n') || `ffmpeg çıkış kodu ${code}`));
    });
  });
}

// Sessiz aralıkları bul (kaynak videonun zamanıyla). Ses sonuna kadar sessizse bitiş = out.
export function detectSilences(file, start, end, db = -35, minDur = 0.5) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, [
      '-hide_banner', '-nostdin', '-ss', start.toFixed(3), '-t', (end - start).toFixed(3), '-i', file,
      '-vn', '-af', `silencedetect=n=${db}dB:d=${minDur}`, '-f', 'null', '-',
    ], { windowsHide: true });
    const out = [];
    let open = null;
    let buf = '';
    p.stderr.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) {
        const s = /silence_start: (-?[\d.]+)/.exec(l);
        const e = /silence_end: (-?[\d.]+)/.exec(l);
        if (s) open = Math.max(0, Number(s[1]));
        if (e && open != null) (out.push([start + open, start + Number(e[1])]), (open = null));
      }
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('Ses analizi başarısız'));
      if (open != null) out.push([start + open, end]);
      resolve(out);
    });
  });
}

// Zaman çizelgesindeki ses dalgası için saniyede `perSec` tepe değeri (0–1)
export async function waveform(file, perSec = 40) {
  const rate = 4000;
  const b = await run(FFMPEG, ['-hide_banner', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1']);
  const n = Math.floor(b.length / 2);
  const step = rate / perSec;
  const peaks = [];
  for (let i = 0; i < n; i += step) {
    let max = 0;
    for (let j = i; j < Math.min(n, i + step); j++) max = Math.max(max, Math.abs(b.readInt16LE(j * 2)));
    peaks.push(Math.round((max / 32768) * 100) / 100);
  }
  return { perSec, peaks };
}

// Whisper için 16 kHz mono float32 PCM
export async function extractPcm(file, start, dur) {
  const b = await run(FFMPEG, [
    '-hide_banner', '-nostdin', '-ss', start.toFixed(3), '-t', dur.toFixed(3), '-i', file,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1',
  ]);
  const out = new Float32Array(Math.floor(b.length / 4));
  new Uint8Array(out.buffer).set(b.subarray(0, out.length * 4));
  return out;
}
