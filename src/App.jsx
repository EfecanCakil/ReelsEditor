import { useCallback, useEffect, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import MediaPanel from './components/MediaPanel.jsx';
import Preview from './components/Preview.jsx';
import Inspector from './components/Inspector.jsx';
import Timeline from './components/Timeline.jsx';
import ExportModal from './components/ExportModal.jsx';
import Toast from './components/Toast.jsx';
import Splash from './components/Splash.jsx';
import Home from './components/Home.jsx';
import Help from './components/Help.jsx';
import { useStore } from './store.js';
import { player } from './player.js';
import { totalDur } from './timeline.js';
import { saveProject, startAutosave } from './projectActions.js';
import { api } from './api.js';

function useKeyboard() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox')) return;
      const s = useStore.getState();
      if (s.exportOpen || s.helpOpen) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 'z' && !e.shiftKey) s.undo();
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) s.redo();
      else if (ctrl && k === 's') saveProject();
      else if (ctrl) return;
      else if (e.key === ' ') player.toggle();
      else if (k === 's') s.splitAt(s.time);
      else if (k === 't') s.addText();
      else if (e.key === 'Delete' || e.key === 'Backspace') s.deleteSelection();
      else if (e.key === 'ArrowLeft') player.seek(s.time - (e.shiftKey ? 1 : 1 / 30));
      else if (e.key === 'ArrowRight') player.seek(s.time + (e.shiftKey ? 1 : 1 / 30));
      else if (e.key === 'Home') player.seek(0);
      else if (e.key === 'End') player.seek(totalDur(s.project.clips));
      else if (e.key === '?') s.setUI({ helpOpen: true });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// Dosyaları Gezgin'den pencereye sürükle-bırak
async function onDrop(e) {
  e.preventDefault();
  useStore.setState({ dragOver: false });
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  const s = useStore.getState();
  const wasEmpty = !s.project.clips.length;
  const { items, errors } = await api.probePaths(paths);
  const visual = items.filter((m) => m.hasVideo);
  const audio = items.find((m) => !m.hasVideo && m.hasAudio);
  if (visual.length) s.addMedia(visual);
  if (audio) {
    s.setMusic(audio);
    player.syncMusic(s.time);
  }
  if (wasEmpty && visual.length) player.seek(0);
  if (errors.length) s.notify(errors.join('\n'), 'error');
  else if (!items.length) s.notify('Bu dosya türü desteklenmiyor. Video (MP4, MOV, WebM), fotoğraf (JPG, PNG) veya müzik (MP3, WAV) ekleyin.', 'warn');
}

function Editor() {
  useKeyboard();
  const exportOpen = useStore((s) => s.exportOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const dragOver = useStore((s) => s.dragOver);

  useEffect(startAutosave, []);

  // İlk kez editöre girene kısa kullanım rehberini göster
  useEffect(() => {
    try {
      if (!localStorage.getItem('reels.helpSeen')) setTimeout(() => useStore.setState({ helpOpen: true }), 600);
    } catch {}
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        if (!useStore.getState().dragOver) useStore.setState({ dragOver: true });
      }}
      onDragLeave={(e) => !e.relatedTarget && useStore.setState({ dragOver: false })}
      onDrop={onDrop}
    >
      <TopBar />
      <div className="main">
        <MediaPanel />
        <Preview />
        <Inspector />
      </div>
      <Timeline />
      {dragOver && (
        <div className="drop-overlay">
          <div>Bırak, projeye ekleyelim</div>
        </div>
      )}
      {exportOpen && <ExportModal />}
      {helpOpen && <Help />}
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const [splash, setSplash] = useState(true);
  const dirty = useStore((s) => s.dirty);
  const done = useCallback(() => setSplash(false), []);

  // Kaydedilmemiş değişiklik varken pencere kapatılırsa ana süreç onay sorar
  useEffect(() => {
    window.onbeforeunload = dirty ? () => false : null;
  }, [dirty]);

  return (
    <>
      {screen === 'home' ? <Home /> : <Editor />}
      {splash && <Splash onDone={done} />}
      <Toast />
    </>
  );
}
