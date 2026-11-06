import { applyRemoteMerge, getState, markClean, setDataChangeHandler, setSyncState, updateSettings } from './store';
import { createGist, GistError, pullGist, pushGist } from './gist';
import { mergeData, serialize } from './merge';

let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
/** ローカルで編集した回数。同期の通信中に編集があったかを知るために使う */
let localEdits = 0;

const AUTO_DELAY_MS = 2500;

/**
 * Gist との同期（pull → 統合 → 差分があれば push）。
 * 端末間の競合は id 単位の updatedAt 比較で自動統合するので、選択ダイアログは出ない。
 */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync() {
  clearTimeout(timer);
  const { token, gistId } = getState().settings;
  if (!token) return;

  setSyncState({ status: 'syncing', message: '' });
  const editsAtStart = localEdits;
  try {
    if (!gistId) {
      const id = await createGist(token, getState().data);
      updateSettings({ gistId: id });
    } else {
      const remote = await pullGist(token, gistId);
      if (remote) applyRemoteMerge(remote);
      const merged = getState().data;
      const needsPush = !remote || serialize(mergeData(merged, remote)) !== serialize(remote);
      if (needsPush) await pushGist(token, gistId, merged);
    }
    // 通信中に編集があった場合は未送信のまま残し、もう一度同期する
    const editedDuringSync = localEdits !== editsAtStart;
    if (!editedDuringSync) markClean();
    setSyncState({ status: editedDuringSync ? 'pending' : 'idle', message: '', lastSyncedAt: Date.now() });
    if (editedDuringSync) scheduleSync();
  } catch (e) {
    setSyncState({ status: 'error', message: e instanceof GistError ? e.message : '同期に失敗しました' });
  }
}

export function scheduleSync() {
  const { token, autoSync } = getState().settings;
  if (!token || !autoSync) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), AUTO_DELAY_MS);
}

export function initSync() {
  setDataChangeHandler(() => {
    localEdits++;
    scheduleSync();
  });
  const kick = () => {
    const { token, autoSync } = getState().settings;
    if (token && autoSync) void syncNow();
  };
  // 起動時・タブやアプリに戻ったとき・回線が復帰したときに同期する
  kick();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  window.addEventListener('online', kick);
  // 開きっぱなしのタブでも、別端末の編集が 1 分ほどで届くようにする
  setInterval(() => {
    if (document.visibilityState === 'visible') kick();
  }, 60_000);
}
