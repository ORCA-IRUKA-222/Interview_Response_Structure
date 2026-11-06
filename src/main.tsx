import { render } from 'preact';
import { App } from './ui/App';
import { flushSave } from './lib/store';
import { initSync } from './lib/sync';
import './styles.css';

render(<App />, document.getElementById('app')!);

// 画面を閉じる/切り替える直前に、保存待ちの変更を書き込む
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

initSync();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
