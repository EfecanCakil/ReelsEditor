import { MODELS, downloadTracker } from './models.mjs';

// Altyazı çevirisi. Türkçe→İngilizce için küçük ve hızlı OPUS-MT (~115 MB),
// diğer tüm yönler için Meta NLLB-200 (~900 MB, 200 dil). İkisi de ilk kullanımda indirilir.
export const NLLB = {
  turkish: 'tur_Latn',
  english: 'eng_Latn',
  german: 'deu_Latn',
  french: 'fra_Latn',
  spanish: 'spa_Latn',
  italian: 'ita_Latn',
  portuguese: 'por_Latn',
  russian: 'rus_Cyrl',
  arabic: 'arb_Arab',
  persian: 'pes_Arab',
  azerbaijani: 'azj_Latn',
  japanese: 'jpn_Jpan',
  korean: 'kor_Hang',
  chinese: 'zho_Hans',
  hindi: 'hin_Deva',
  dutch: 'nld_Latn',
};

export const translationModel = (from, to) => (from === 'turkish' && to === 'english' ? 'opus-tr-en' : 'nllb');

export async function translate({ texts, from, to }, onProgress, cacheDir, isCancelled) {
  if (!NLLB[from] || !NLLB[to]) throw new Error('Desteklenmeyen dil');
  if (from === to) throw new Error('Kaynak ve hedef dil aynı');
  const key = translationModel(from, to);
  const m = MODELS[key];
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  onProgress({ stage: 'model', progress: 0 });
  const tr = await pipeline('translation', m.id, {
    dtype: m.dtype,
    device: 'cpu',
    progress_callback: downloadTracker(onProgress, m.size),
  });
  const opts = key === 'nllb' ? { src_lang: NLLB[from], tgt_lang: NLLB[to], max_new_tokens: 200 } : { max_new_tokens: 200 };
  const out = [];
  try {
    for (let i = 0; i < texts.length; i++) {
      if (isCancelled()) throw new Error('İptal edildi');
      onProgress({ stage: 'translate', index: i, count: texts.length, progress: i / texts.length });
      const r = await tr(texts[i], opts);
      out.push((r[0]?.translation_text || '').trim());
    }
  } finally {
    await tr.dispose?.();
  }
  onProgress({ stage: 'done', progress: 1 });
  return out;
}
