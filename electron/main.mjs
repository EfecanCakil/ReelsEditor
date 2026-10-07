import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { probe, exportVideo, thumbnail, detectSilences, waveform, IMAGE_EXT } from './ffmpeg.mjs';
import { transcribe } from './transcribe.mjs';
import { translate } from './translate.mjs';
import { cachedModels } from './models.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged && process.argv.includes('--dev');

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'];
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } },
]);

// Arayüz yalnızca kullanıcının seçtiği dosyaları okuyabilir
const allowed = new Set();
const allow = (p) => allowed.add(path.resolve(p).toLowerCase());

// media://local/<encoded path> — video atlama (seek) için Range desteği gerekli
async function handleMedia(req) {
  const file = decodeURIComponent(new URL(req.url).pathname.slice(1));
  if (!allowed.has(path.resolve(file).toLowerCase())) return new Response('Forbidden', { status: 403 });
  let size;
  try {
    size = (await fs.promises.stat(file)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (range) {
    let start = range[1] ? Number(range[1]) : 0;
    let end = range[2] ? Number(range[2]) : size - 1;
    if (!range[1] && range[2]) {
      start = size - Number(range[2]);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
  });
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e1014',
    title: 'Reels Editor',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  // Arayüz kaydedilmemiş değişiklik olduğunu bildirirse kapatmadan önce sor
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Kaydetmeden çık', 'Vazgeç'],
      defaultId: 1,
      cancelId: 1,
      title: 'Reels Editor',
      message: 'Kaydedilmemiş değişiklikler var.',
      detail: 'Çıkarsan son değişikliklerin kaybolur. Kaydetmek için “Vazgeç”e basıp Ctrl+S kullan.',
    });
    if (choice === 0) {
      // Kullanıcı bilerek kaydetmeden çıktı: kurtarma kopyasını da sil
      fs.rmSync(path.join(app.getPath('userData'), 'autosave.json'), { force: true });
      e.preventDefault();
    }
  });
  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

async function probeMany(paths) {
  const items = [];
  const errors = [];
  for (const f of paths) {
    try {
      const info = await probe(f);
      allow(f);
      if (info.hasVideo) info.thumb = await thumbnail(info);
      items.push(info);
    } catch (err) {
      errors.push(`${path.basename(f)}: ${err.message.split('\n').pop()}`);
    }
  }
  return { items, errors };
}

let currentExport = null;

function registerIpc() {
  ipcMain.handle('media:open', async (_e, kind) => {
    const audio = kind === 'audio';
    const r = await dialog.showOpenDialog(win, {
      title: audio ? 'Müzik seç' : 'Video veya fotoğraf seç',
      properties: audio ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: audio
        ? [{ name: 'Ses', extensions: AUDIO_EXT }]
        : [
            { name: 'Video ve fotoğraf', extensions: [...VIDEO_EXT, ...IMAGE_EXT] },
            { name: 'Video', extensions: VIDEO_EXT },
            { name: 'Fotoğraf', extensions: IMAGE_EXT },
          ],
    });
    if (r.canceled) return { items: [], errors: [] };
    return probeMany(r.filePaths);
  });

  ipcMain.handle('media:probePaths', async (_e, paths) => {
    const ok = (paths || []).filter((p) => [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].includes(path.extname(p).slice(1).toLowerCase()));
    return probeMany(ok);
  });

  ipcMain.handle('project:save', async (_e, data, currentPath) => {
    let p = currentPath;
    if (!p) {
      const r = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('documents'), 'proje.reels.json'),
        filters: [{ name: 'Reels Projesi', extensions: ['json'] }],
      });
      if (r.canceled) return null;
      p = r.filePath;
    }
    await fs.promises.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
    return p;
  });

  const readProject = async (p) => {
    const data = JSON.parse(await fs.promises.readFile(p, 'utf8'));
    const paths = [...Object.values(data.media || {}).map((m) => m.path), data.music?.path].filter(Boolean);
    const missing = paths.filter((f) => !fs.existsSync(f));
    paths.forEach(allow);
    return { path: p, data, missing };
  };
  ipcMain.handle('project:open', async (_e, filePath) => {
    if (filePath) return readProject(filePath); // son projeler listesinden
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Reels Projesi', extensions: ['json'] }],
    });
    if (r.canceled) return null;
    return readProject(r.filePaths[0]);
  });
  ipcMain.handle('fs:exists', (_e, paths) => (paths || []).map((p) => fs.existsSync(p)));

  // Otomatik kaydetme: kaydedilmemiş çalışma uygulama kapanınca/çökünce kurtarılabilsin
  const autosaveFile = path.join(app.getPath('userData'), 'autosave.json');
  ipcMain.handle('project:autosave', (_e, data, projectPath) =>
    fs.promises.writeFile(autosaveFile, JSON.stringify({ savedAt: Date.now(), projectPath, data }), 'utf8'),
  );
  ipcMain.handle('project:recovery', async () => {
    try {
      const r = JSON.parse(await fs.promises.readFile(autosaveFile, 'utf8'));
      [...Object.values(r.data.media || {}).map((m) => m.path), r.data.music?.path].filter(Boolean).forEach(allow);
      return r;
    } catch {
      return null;
    }
  });
  ipcMain.handle('project:clearAutosave', () => fs.promises.rm(autosaveFile, { force: true }));

  ipcMain.handle('media:silences', (_e, file, start, end, db, minDur) => detectSilences(file, start, end, db, minDur));
  ipcMain.handle('media:waveform', async (_e, file) => {
    try {
      return await waveform(file);
    } catch {
      return null;
    }
  });
  ipcMain.handle('export:pickImage', async (_e, name) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('pictures'), name || 'kapak.png'),
      filters: [{ name: 'PNG resim', extensions: ['png'] }],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('export:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Parçaların kaydedileceği klasörü seçin',
      defaultPath: app.getPath('videos'),
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('file:saveText', async (_e, content, defaultName, ext) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (r.canceled) return null;
    await fs.promises.writeFile(r.filePath, content, 'utf8');
    return r.filePath;
  });

  ipcMain.handle('export:pickPath', async (_e, name) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('videos'), name || 'reels.mp4'),
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('export:start', async (e, job) => {
    const ac = new AbortController();
    currentExport = ac;
    try {
      await exportVideo(job, (p) => e.sender.send('export:progress', p), ac.signal);
      return { ok: true };
    } catch (err) {
      return { ok: false, cancelled: ac.signal.aborted, error: err.message };
    } finally {
      currentExport = null;
    }
  });
  ipcMain.handle('export:cancel', () => currentExport?.abort());
  ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));

  // Yapay zekâ işleri (altyazı, çeviri) aynı anda tek tane çalışır ve iptal edilebilir
  const models = path.join(app.getPath('userData'), 'models');
  let aiCancelled = false;
  const aiJob = (fn) => async (e, req) => {
    aiCancelled = false;
    try {
      return { ok: true, result: await fn(req, (p) => e.sender.send('ai:progress', p), models, () => aiCancelled) };
    } catch (err) {
      return { ok: false, cancelled: aiCancelled, error: friendlyError(err) };
    }
  };
  ipcMain.handle('transcribe:start', aiJob(transcribe));
  ipcMain.handle('translate:start', aiJob(translate));
  ipcMain.handle('ai:cancel', () => void (aiCancelled = true));
  ipcMain.handle('ai:models', () => cachedModels(models));
}

// İnternet / indirme hatalarını kullanıcının anlayacağı dile çevir
function friendlyError(err) {
  const m = String(err?.message || err);
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network error|Could not locate file|\b(403|429|50[0-4])\b/i.test(m)) {
    return 'Model indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin (huggingface.co erişilebilir olmalı).';
  }
  if (/^terminated$|aborted|socket hang up|other side closed|UND_ERR/i.test(m)) {
    return 'İndirme yarıda kesildi (bağlantı koptu). Tekrar denediğinde kalan kısım yeniden indirilir; büyük modellerde daha küçük bir doğruluk seçeneği de kullanabilirsin.';
  }
  return m;
}

app.whenReady().then(() => {
  protocol.handle('media', handleMedia);
  registerIpc();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
