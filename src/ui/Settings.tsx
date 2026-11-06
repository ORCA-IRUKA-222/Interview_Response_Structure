import { useRef, useState } from 'preact/hooks';
import { clearLocalData, importData, updateSettings, useAppState } from '../lib/store';
import { syncNow } from '../lib/sync';
import { download, toJson, toMarkdown } from '../lib/exporter';
import { paths } from './router';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=interview-note';

export function Settings() {
  const { data, settings, sync } = useAppState();
  const [token, setToken] = useState(settings.token);
  const [gistId, setGistId] = useState(settings.gistId);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const connect = async () => {
    updateSettings({ token: token.trim(), gistId: gistId.trim() });
    if (token.trim()) await syncNow();
  };

  const disconnect = () => {
    if (!confirm('同期を解除します（この端末のデータは残ります）。よろしいですか？')) return;
    updateSettings({ token: '', gistId: '' });
    setToken('');
    setGistId('');
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      importData(JSON.parse(await file.text()));
      setMessage(`「${file.name}」を取り込みました（既存データとは統合されます）`);
    } catch (e) {
      setMessage(`取り込めませんでした: ${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const connected = !!settings.token;

  return (
    <main class="page settings">
      <div class="page-head">
        <a class="btn back" href={paths.home}>
          ← ホーム
        </a>
        <h2 class="grow">設定</h2>
      </div>

      <section class="card">
        <h3>Gist で同期（スマホ ⇄ PC）</h3>
        <p class="muted">
          データは <strong>シークレット Gist</strong>（URL を知る人だけが見られる非公開 Gist）の JSON 1 ファイルに保存されます。
          同じトークンと Gist ID を各端末に設定すれば、変更が自動で統合されます。
        </p>
        <ol class="steps">
          <li>
            <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
              GitHub でトークンを発行
            </a>
            （権限は <code>gist</code> だけ）
          </li>
          <li>下に貼り付けて「接続して同期」。初回は Gist が自動で作られます</li>
          <li>2 台目の端末では、同じトークンと、表示された Gist ID を入力します</li>
        </ol>
        <label>
          GitHub トークン
          <input
            type="password"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            value={token}
            placeholder="ghp_… / github_pat_…"
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
        </label>
        <label>
          Gist ID（空欄なら新規作成）
          <input
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            value={gistId}
            placeholder="例: 8f3a…"
            onInput={(e) => setGistId((e.target as HTMLInputElement).value)}
          />
        </label>
        <p class="muted small">トークンはこの端末のブラウザ内にだけ保存され、GitHub 以外には送信されません。</p>
        <div class="form-actions">
          <button type="button" class="btn primary" disabled={!token.trim() || sync.status === 'syncing'} onClick={connect}>
            {connected ? '設定を保存して同期' : '接続して同期'}
          </button>
          {connected && (
            <button type="button" class="btn danger" onClick={disconnect}>
              同期を解除
            </button>
          )}
        </div>
        {connected && (
          <>
            <label class="check">
              <input
                type="checkbox"
                checked={settings.autoSync}
                onChange={(e) => updateSettings({ autoSync: (e.target as HTMLInputElement).checked })}
              />
              編集後・起動時・アプリに戻ったとき自動で同期する
            </label>
            <p class={`status-line ${sync.status}`}>
              状態: {{ off: '未接続', idle: '同期済み', pending: '未送信の変更があります', syncing: '同期中…', error: 'エラー' }[sync.status]}
              {sync.lastSyncedAt && ` ・ 最終 ${new Date(sync.lastSyncedAt).toLocaleString('ja-JP')}`}
              {sync.message && <strong> ・ {sync.message}</strong>}
            </p>
            {settings.gistId && (
              <p class="muted small">
                Gist ID: <code>{settings.gistId}</code>（2 台目に入力）
              </p>
            )}
          </>
        )}
      </section>

      <section class="card">
        <h3>書き出し・取り込み</h3>
        <p class="muted">
          面接 {data.interviews.length} 件 ・ 質問 {data.questions.length} 件
        </p>
        <div class="form-actions">
          <button type="button" class="btn" onClick={() => download(`面接ノート-${stamp}.json`, toJson(data), 'application/json')}>
            JSON で書き出す
          </button>
          <button type="button" class="btn" onClick={() => download(`面接ノート-${stamp}.md`, toMarkdown(data), 'text/markdown')}>
            Markdown で書き出す
          </button>
          <button type="button" class="btn" onClick={() => fileRef.current?.click()}>
            JSON を取り込む
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport((e.target as HTMLInputElement).files?.[0])} />
        </div>
        {message && <p class="status-line">{message}</p>}
      </section>

      <section class="card">
        <h3>音声（カラオケ）</h3>
        <label>
          認識する言語
          <select
            value={settings.karaoke.lang}
            onChange={(e) => updateSettings({ karaoke: { ...settings.karaoke, lang: (e.target as HTMLSelectElement).value } })}
          >
            <option value="ja-JP">日本語</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
          </select>
        </label>
        <p class="muted small">音声認識はブラウザの機能（Chrome などでは Google のサーバー）で行われ、このアプリが録音を保存することはありません。</p>
      </section>

      <section class="card">
        <h3>この端末のデータ</h3>
        <p class="muted small">同期していない場合、消すと元に戻せません。先に書き出しておくと安心です。</p>
        <button
          type="button"
          class="btn danger"
          onClick={() => confirm('この端末のデータをすべて消します。Gist 側は変わりません。よろしいですか？') && clearLocalData()}
        >
          この端末のデータを消す
        </button>
      </section>
    </main>
  );
}
