import fs from 'node:fs';
import path from 'node:path';

// Uygulamanın kullandığı yapay zekâ modelleri. size: indirme boyutu (MB), files: önbellekte olup olmadığını anlamak için.
export const MODELS = {
  'whisper-base': {
    id: 'onnx-community/whisper-base_timestamped',
    dtype: 'fp32',
    size: 290,
    files: ['onnx/encoder_model.onnx', 'onnx/decoder_model_merged.onnx'],
  },
  'whisper-small': {
    id: 'onnx-community/whisper-small_timestamped',
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    size: 250,
    files: ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
  },
  'whisper-turbo': {
    id: 'onnx-community/whisper-large-v3-turbo_timestamped',
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    size: 1090,
    files: ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
  },
  'opus-tr-en': {
    id: 'Xenova/opus-mt-tr-en',
    dtype: 'q8',
    size: 115,
    files: ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
  },
  nllb: {
    id: 'Xenova/nllb-200-distilled-600M',
    dtype: 'q8',
    size: 900,
    files: ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'],
  },
};

export function cachedModels(cacheDir) {
  const out = {};
  for (const [key, m] of Object.entries(MODELS)) {
    out[key] = m.files.every((f) => fs.existsSync(path.join(cacheDir, m.id, f)));
  }
  return out;
}

// İndirme ilerlemesini dosyalar genelinde topla: yüzde, MB ve kalan süre
export function downloadTracker(onProgress, expectedMB) {
  const files = new Map();
  const t0 = Date.now();
  let last = 0;
  return (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, p);
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    total = Math.max(total, expectedMB * 1e6);
    const now = Date.now();
    if (now - last < 250) return;
    last = now;
    const speed = loaded / Math.max(0.5, (now - t0) / 1000);
    onProgress({
      stage: 'download',
      progress: Math.min(1, loaded / total),
      loadedMB: Math.round(loaded / 1e6),
      totalMB: Math.round(total / 1e6),
      etaSec: speed > 0 ? Math.round((total - loaded) / speed) : null,
    });
  };
}
