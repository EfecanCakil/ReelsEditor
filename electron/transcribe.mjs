import { extractPcm } from './ffmpeg.mjs';
import { MODELS, downloadTracker } from './models.mjs';

// Whisper (*_timestamped) ile kelime düzeyinde zamanlı yazıya dökme.
// Model ilk kullanımda indirilir, iş bitince bellekten atılır (8 GB RAM'li makineler için).
export async function transcribe({ segments, language, model }, onProgress, cacheDir, isCancelled) {
  const m = MODELS[model] || MODELS['whisper-small'];
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;

  onProgress({ stage: 'model', progress: 0 });
  const asr = await pipeline('automatic-speech-recognition', m.id, {
    dtype: m.dtype,
    device: 'cpu',
    progress_callback: downloadTracker(onProgress, m.size),
  });

  // Dönen: zaman çizelgesine göre mutlak zamanlı kelimeler [{ text, start, end }]
  const words = [];
  try {
    const totalDur = segments.reduce((a, s) => a + (s.out - s.in), 0) || 1;
    let done = 0;
    for (let i = 0; i < segments.length; i++) {
      if (isCancelled()) throw new Error('İptal edildi');
      const s = segments[i];
      const dur = s.out - s.in;
      const speed = s.speed || 1;
      onProgress({ stage: 'transcribe', index: i, count: segments.length, progress: done / totalDur });
      const pcm = await extractPcm(s.path, s.in, dur);
      done += dur;
      if (pcm.length < 1600) continue;
      const r = await asr(pcm, {
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      for (const c of r.chunks || []) {
        const text = (c.text || '').trim();
        if (!text) continue;
        const a = Math.min(c.timestamp?.[0] ?? 0, dur);
        const b = Math.min(c.timestamp?.[1] ?? a + 0.3, dur);
        words.push({ text, start: s.offset + a / speed, end: s.offset + Math.max(a + 0.05, b) / speed });
      }
    }
  } finally {
    await asr.dispose?.();
  }
  onProgress({ stage: 'done', progress: 1 });
  return words;
}
