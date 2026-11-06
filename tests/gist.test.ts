import { describe, expect, it } from 'vitest';
import { createGist, GIST_FILE, GistError, pullGist, pushGist } from '../src/lib/gist';
import { createInterview, createQuestion, emptyData } from '../src/lib/model';
import { serialize } from '../src/lib/merge';

const data = (() => {
  const d = emptyData();
  d.interviews.push(createInterview({ id: 'i', company: 'ACME' }));
  d.questions.push(createQuestion('i', { id: 'q', text: '質問' }));
  return d;
})();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('gist client', () => {
  it('secret gist を作成する（public: false、トークンはヘッダのみ）', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return json({ id: 'abc' }, 201);
    }) as unknown as typeof fetch;
    expect(await createGist('tok', data, f)).toBe('abc');
    const body = JSON.parse(seen!.init.body as string);
    expect(body.public).toBe(false);
    expect(body.files[GIST_FILE].content).toBe(serialize(data));
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(seen!.url).not.toContain('tok');
    expect(seen!.init.cache).toBe('no-store');
  });

  it('取得して Data に戻す。ファイルが無ければ null', async () => {
    const ok = (async () => json({ files: { [GIST_FILE]: { content: serialize(data) } } })) as unknown as typeof fetch;
    expect((await pullGist('t', 'id', ok))!.questions[0].text).toBe('質問');
    const empty = (async () => json({ files: {} })) as unknown as typeof fetch;
    expect(await pullGist('t', 'id', empty)).toBeNull();
  });

  it('大きなファイル(truncated)は raw_url から読む', async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://api.github.com')) {
        return json({ files: { [GIST_FILE]: { truncated: true, content: '{', raw_url: 'https://raw.example/x' } } });
      }
      return new Response(serialize(data));
    }) as unknown as typeof fetch;
    const got = await pullGist('t', 'id', f);
    expect(got!.interviews[0].company).toBe('ACME');
    expect(calls[1]).toBe('https://raw.example/x');
  });

  it('PATCH で更新し、エラーは分かりやすい文言にする', async () => {
    let method = '';
    const f = (async (_u: string, init: RequestInit) => {
      method = init.method!;
      return json({});
    }) as unknown as typeof fetch;
    await pushGist('t', 'id', data, f);
    expect(method).toBe('PATCH');

    const status = (s: number) => (async () => json({}, s)) as unknown as typeof fetch;
    await expect(pullGist('t', 'id', status(401))).rejects.toThrow(/トークン/);
    await expect(pullGist('t', 'id', status(404))).rejects.toThrow(/見つかりません/);
    await expect(pullGist('t', 'id', status(403))).rejects.toBeInstanceOf(GistError);
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(pullGist('t', 'id', offline)).rejects.toThrow(/ネットワーク/);
  });

  it('壊れた JSON は読めない旨を返す', async () => {
    const f = (async () => json({ files: { [GIST_FILE]: { content: 'not json' } } })) as unknown as typeof fetch;
    await expect(pullGist('t', 'id', f)).rejects.toThrow(/読めません/);
  });
});
