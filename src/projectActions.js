import { useStore } from './store.js';
import { api } from './api.js';
import { player } from './player.js';

// Son projeler bu bilgisayarda (localStorage) tutulur
const KEY = 'reels.recent';

export function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function remember(path, project) {
  const thumb = Object.values(project.media).find((m) => m.thumb)?.thumb || null;
  const entry = {
    path,
    name: path.split(/[\\/]/).pop().replace(/\.reels\.json$|\.json$/i, ''),
    format: project.format,
    clips: project.clips.length,
    savedAt: Date.now(),
    thumb,
  };
  const list = [entry, ...getRecent().filter((r) => r.path !== path)].slice(0, 8);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // depolama doluysa küçük resimsiz kaydet
    localStorage.setItem(KEY, JSON.stringify(list.map((r) => ({ ...r, thumb: null }))));
  }
}

export function forgetRecent(path) {
  localStorage.setItem(KEY, JSON.stringify(getRecent().filter((r) => r.path !== path)));
}

export async function saveProject() {
  const s = useStore.getState();
  const p = await api.saveProject(s.project, s.projectPath);
  if (!p) return false;
  useStore.setState({ projectPath: p, dirty: false });
  remember(p, s.project);
  api.clearAutosave();
  s.notify('Proje kaydedildi');
  return true;
}

const confirmLeave = () => {
  if (!useStore.getState().dirty) return true;
  if (!confirm('Kaydedilmemiş değişiklikler var. Kaydetmeden devam edilsin mi?')) return false;
  api.clearAutosave(); // bilerek vazgeçildi; kurtarma kopyasına gerek yok
  return true;
};

// Kaydedilmemiş çalışmayı düzenli aralıklarla yedekle (çökme/elektrik kesintisine karşı)
export function startAutosave() {
  const id = setInterval(() => {
    const s = useStore.getState();
    if (s.dirty && s.project.clips.length) api.autosave(s.project, s.projectPath);
  }, 15000);
  return () => clearInterval(id);
}

export async function restoreAutosave(r) {
  useStore.getState().loadProject(r.data, r.projectPath || null);
  useStore.setState({ dirty: true });
  useStore.getState().notify('Çalışman geri yüklendi. Kaydetmeyi unutma (Ctrl+S).');
}

export async function openProject(filePath) {
  const s = useStore.getState();
  if (s.screen === 'editor' && !confirmLeave()) return;
  try {
    const r = await api.openProject(filePath);
    if (!r) return;
    player.pause();
    s.loadProject(r.data, r.path);
    remember(r.path, r.data);
    if (r.missing.length) s.notify(`Bu dosyalar bulunamadı (taşınmış veya silinmiş olabilir):\n${r.missing.join('\n')}`, 'error');
  } catch (err) {
    if (filePath) forgetRecent(filePath);
    s.notify(`Proje açılamadı: ${err.message}`, 'error');
  }
}

export function goHome() {
  if (!confirmLeave()) return;
  player.pause();
  useStore.getState().goHome();
}

// Karşılama ekranından yeni proje: formatı seç, ardından dosya seçme penceresini aç
export async function startNewProject(format, { pick = true } = {}) {
  useStore.getState().newProject(format);
  if (pick) {
    const { importMedia } = await import('./components/MediaPanel.jsx');
    importMedia();
  }
}
