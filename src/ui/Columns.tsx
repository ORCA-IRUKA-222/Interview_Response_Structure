import { useState } from 'preact/hooks';
import { childrenOf, flattenTree } from '../lib/model';
import { addInterview, addQuestion, deleteInterview, updateInterview, useAppState } from '../lib/store';
import { download, toMarkdown } from '../lib/exporter';
import { isDue, todayString } from '../lib/srs';
import { StatusDot } from './common';
import { go, paths } from './router';

export function InterviewList({ selected }: { selected?: string }) {
  const { data } = useAppState();
  const sorted = [...data.interviews].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
  );
  const create = () => go(paths.interview(addInterview()));
  return (
    <section class="col col-list" aria-label="面接の一覧">
      <header class="col-head">
        <h2>面接</h2>
        <button type="button" class="btn primary" onClick={create}>
          ＋ 追加
        </button>
      </header>
      <div class="col-body">
        {sorted.length === 0 && (
          <div class="empty">
            <p>まだ面接がありません。</p>
            <p class="muted">企業ごと・選考ごとに「面接」を作り、その中に質問と回答を貯めていきます。</p>
            <button type="button" class="btn primary" onClick={create}>
              最初の面接を作る
            </button>
          </div>
        )}
        <ul class="list">
          {sorted.map((i) => {
            const qs = data.questions.filter((q) => q.interviewId === i.id);
            const done = qs.filter((q) => q.status === 'done').length;
            return (
              <li key={i.id}>
                <a href={paths.interview(i.id)} class={`row ${selected === i.id ? 'selected' : ''}`}>
                  <span class="row-main">
                    <strong>{i.company || i.title || '(無題の面接)'}</strong>
                    {i.company && i.title && <span class="muted"> {i.title}</span>}
                  </span>
                  <span class="row-sub muted">
                    {i.date && <span>{i.date}</span>}
                    <span class={`badge ${i.stage}`}>{i.stage === 'done' ? '実施済み' : '準備中'}</span>
                    <span>
                      {done}/{qs.length} 完成
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function QuestionTree({ iid, selected }: { iid: string; selected?: string }) {
  const { data } = useAppState();
  const interview = data.interviews.find((i) => i.id === iid);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(() => !!interview && !interview.company && !interview.title);
  if (!interview) {
    return (
      <section class="col col-tree">
        <header class="col-head">
          <a class="btn back" href={paths.home}>
            ← 一覧
          </a>
        </header>
        <div class="col-body">
          <div class="empty">この面接は見つかりません（別の端末で削除された可能性があります）。</div>
        </div>
      </section>
    );
  }

  const rows = flattenTree(data.questions, iid);
  const today = todayString();
  const dueCount = rows.filter(({ question: q }) => (q.answer || q.keyPoints) && isDue(q.card, today)).length;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const id = addQuestion(iid, { text });
    setDraft('');
    go(paths.question(iid, id));
  };

  const remove = () => {
    if (!confirm(`「${interview.company || interview.title || '無題の面接'}」と、その質問・回答をすべて削除しますか？`)) return;
    deleteInterview(iid);
    go(paths.home);
  };

  return (
    <section class="col col-tree" aria-label="質問の構造">
      <header class="col-head">
        <a class="btn back" href={paths.home}>
          ← 一覧
        </a>
        <h2 class="grow">{interview.company || interview.title || '(無題の面接)'}</h2>
        <button type="button" class="btn" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? '閉じる' : '編集'}
        </button>
      </header>
      <div class="col-body">
        {editing && (
          <div class="card form">
            <label>
              企業名
              <input
                value={interview.company}
                onInput={(e) => updateInterview(iid, { company: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              選考（例: 一次面接）
              <input
                value={interview.title}
                onInput={(e) => updateInterview(iid, { title: (e.target as HTMLInputElement).value })}
              />
            </label>
            <div class="form-row">
              <label>
                日付
                <input
                  type="date"
                  value={interview.date}
                  onInput={(e) => updateInterview(iid, { date: (e.target as HTMLInputElement).value })}
                />
              </label>
              <label>
                状態
                <select
                  value={interview.stage}
                  onChange={(e) =>
                    updateInterview(iid, { stage: (e.target as HTMLSelectElement).value as 'preparing' | 'done' })
                  }
                >
                  <option value="preparing">準備中</option>
                  <option value="done">実施済み</option>
                </select>
              </label>
            </div>
            <label>
              メモ
              <textarea
                rows={2}
                value={interview.note}
                onInput={(e) => updateInterview(iid, { note: (e.target as HTMLTextAreaElement).value })}
              />
            </label>
            <div class="form-actions">
              <button
                type="button"
                class="btn"
                onClick={() => download(`面接ノート-${interview.company || 'interview'}.md`, toMarkdown(data, iid), 'text/markdown')}
              >
                Markdown で書き出す
              </button>
              <button type="button" class="btn danger" onClick={remove}>
                この面接を削除
              </button>
            </div>
          </div>
        )}

        <form
          class="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={draft}
            placeholder="質問を追加（Enter）"
            enterkeyhint="done"
            aria-label="新しい質問"
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn primary" disabled={!draft.trim()}>
            追加
          </button>
        </form>

        {rows.length > 0 && (
          <div class="study-link">
            <a class="btn" href={paths.study({ iid })}>
              単語帳で覚える{dueCount > 0 && ` (${dueCount})`}
            </a>
          </div>
        )}

        {rows.length === 0 && (
          <div class="empty">
            <p>質問がまだありません。</p>
            <p class="muted">上の入力欄に面接で聞かれそうな質問を入れてみましょう。</p>
          </div>
        )}

        <ul class="tree">
          {rows.map(({ question: q, depth }) => {
            const kids = childrenOf(data.questions, iid, q.id).length;
            return (
              <li key={q.id} style={{ '--depth': depth }}>
                <a href={paths.question(iid, q.id)} class={`row tree-row ${selected === q.id ? 'selected' : ''}`}>
                  <StatusDot status={q.status} />
                  <span class="tree-text">
                    {depth > 0 && <span class="branch" aria-hidden="true">↳ </span>}
                    {q.text || '(質問未入力)'}
                  </span>
                  {kids > 0 && <span class="count" title="深掘り質問の数">{kids}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
