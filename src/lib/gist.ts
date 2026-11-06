import type { Data } from '../types';
import { parseData, serialize } from './merge';

const API = 'https://api.github.com';
export const GIST_FILE = 'interview-qa.json';

export class GistError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function request(f: Fetch, token: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await f(`${API}${path}`, {
      ...init,
      // GitHub は GET を 60 秒キャッシュさせるため、別端末の更新を見逃さないよう無効化する
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GistError('ネットワークに接続できません');
  }
  if (res.ok) return res;
  if (res.status === 401) throw new GistError('トークンが無効です（再発行して設定し直してください）', 401);
  if (res.status === 403 || res.status === 429) throw new GistError('GitHub の利用制限に達しました。少し待ってください', res.status);
  if (res.status === 404) throw new GistError('Gist が見つかりません（ID またはトークンの gist 権限を確認）', 404);
  throw new GistError(`GitHub API エラー (${res.status})`, res.status);
}

/** Gist のデータを取得する。Gist にファイルがまだ無い場合は null */
export async function pullGist(token: string, id: string, f: Fetch = fetch): Promise<Data | null> {
  const res = await request(f, token, `/gists/${encodeURIComponent(id)}`);
  const gist = await res.json();
  const file = gist?.files?.[GIST_FILE];
  if (!file) return null;
  let content: string = file.content ?? '';
  if (file.truncated && file.raw_url) {
    const raw = await f(file.raw_url, { cache: 'no-store' });
    if (!raw.ok) throw new GistError(`Gist の本文を取得できません (${raw.status})`, raw.status);
    content = await raw.text();
  }
  try {
    return parseData(JSON.parse(content));
  } catch (e) {
    throw new GistError(`Gist の内容が読めません: ${(e as Error).message}`);
  }
}

export async function createGist(token: string, data: Data, f: Fetch = fetch): Promise<string> {
  const res = await request(f, token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: '面接ノート (interview-response-structure) のデータ',
      public: false,
      files: { [GIST_FILE]: { content: serialize(data) } },
    }),
  });
  const gist = await res.json();
  if (!gist?.id) throw new GistError('Gist の作成に失敗しました');
  return gist.id as string;
}

export async function pushGist(token: string, id: string, data: Data, f: Fetch = fetch): Promise<void> {
  await request(f, token, `/gists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [GIST_FILE]: { content: serialize(data) } } }),
  });
}
