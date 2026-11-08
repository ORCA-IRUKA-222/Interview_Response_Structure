import { describe, expect, it } from 'vitest';
import { createInterview, createQuestion, descendantIds, flattenTree, makeAnchor, remapAnchor, keyPointLines } from '../src/lib/model';
import { mergeData, parseData, serialize } from '../src/lib/merge';
import { emptyData } from '../src/lib/model';
import { toMarkdown } from '../src/lib/exporter';
import { search } from '../src/lib/search';
import { buildDeck, gradeCard, addDays } from '../src/lib/srs';

describe('anchor', () => {
  it('選択範囲の前後の空白を削る', () => {
    const a = makeAnchor('  私は 頑張った。 ', 0, 14)!;
    expect(a.quote).toBe('私は 頑張った。');
    expect(makeAnchor('abc', 1, 1)).toBeNull();
  });

  it('編集で位置がずれても引用を追従する', () => {
    const anchor = { start: 3, end: 6, quote: 'ABC' };
    expect(remapAnchor('xx ABC yy', anchor)).toEqual({ start: 3, end: 6, quote: 'ABC' });
    expect(remapAnchor('前置き追加 xx ABC yy', anchor)).toMatchObject({ start: 9, end: 12 });
    // 同じ引用が複数あるときは元の位置に近い方
    expect(remapAnchor('ABC...........ABC', { start: 12, end: 15, quote: 'ABC' })).toMatchObject({ start: 14 });
  });

  it('引用が消えたら broken になり、戻れば復活する', () => {
    const broken = remapAnchor('全部書き換えた', { start: 0, end: 3, quote: 'ABC' });
    expect(broken.broken).toBe(true);
    const back = remapAnchor('ABC', broken);
    expect(back.broken).toBeUndefined();
  });
});

describe('tree', () => {
  it('深掘りは回答内の位置順に並ぶ', () => {
    const i = createInterview({ id: 'i' });
    const root = createQuestion('i', { id: 'r', text: 'root' });
    const late = createQuestion('i', { id: 'late', parentId: 'r', anchor: { start: 20, end: 25, quote: 'x' }, order: 1 });
    const early = createQuestion('i', { id: 'early', parentId: 'r', anchor: { start: 2, end: 5, quote: 'y' }, order: 2 });
    const grand = createQuestion('i', { id: 'grand', parentId: 'early' });
    const rows = flattenTree([grand, late, root, early], i.id);
    expect(rows.map((r) => [r.question.id, r.depth])).toEqual([
      ['r', 0],
      ['early', 1],
      ['grand', 2],
      ['late', 1],
    ]);
    expect(descendantIds([grand, late, root, early], 'r').sort()).toEqual(['early', 'grand', 'late', 'r']);
  });

  it('要点の行頭記号を除く', () => {
    expect(keyPointLines('- 一つ目\n・二つ目\n1. 三つ目\n\n  四つ目')).toEqual(['一つ目', '二つ目', '三つ目', '四つ目']);
  });
});

describe('merge', () => {
  const base = () => {
    const d = emptyData();
    // 時刻を固定する（Date.now() だと 2 回の base() 呼び出しの間でミリ秒がずれて不安定になる）
    d.interviews.push(createInterview({ id: 'i', title: 'A', createdAt: 1, updatedAt: 10 }));
    d.questions.push(createQuestion('i', { id: 'q1', text: 'q1', order: 1, createdAt: 1, updatedAt: 10 }));
    return d;
  };

  it('新しい更新が勝ち、片方にしかないものは残る（可換）', () => {
    const a = base();
    const b = base();
    a.questions[0] = { ...a.questions[0], text: 'PC版', updatedAt: 20 };
    b.questions[0] = { ...b.questions[0], text: 'スマホ版', updatedAt: 30 };
    b.questions.push(createQuestion('i', { id: 'q2', text: 'new', updatedAt: 25 }));
    const ab = mergeData(a, b);
    const ba = mergeData(b, a);
    expect(serialize(ab)).toBe(serialize(ba));
    expect(ab.questions.find((q) => q.id === 'q1')!.text).toBe('スマホ版');
    expect(ab.questions).toHaveLength(2);
    expect(serialize(mergeData(ab, ab))).toBe(serialize(ab));
  });

  it('削除は墓標で伝わり、削除後に編集されたものは復活する', () => {
    const a = base();
    const b = base();
    b.questions = [];
    b.deleted = { q1: 50 };
    expect(mergeData(a, b).questions).toHaveLength(0);
    a.questions[0] = { ...a.questions[0], updatedAt: 60 };
    expect(mergeData(a, b).questions).toHaveLength(1);
  });

  it('親が消えた深掘りは孤児として落とす', () => {
    const a = base();
    a.questions.push(createQuestion('i', { id: 'child', parentId: 'q1', updatedAt: 10 }));
    const b = base();
    b.questions = [];
    b.deleted = { q1: 99 };
    expect(mergeData(a, b).questions).toHaveLength(0);
  });

  it('parseData は欠けた項目を補い、壊れた入力を拒否する', () => {
    const d = parseData({ interviews: [{ id: 'i' }], questions: [{ id: 'q', interviewId: 'i', anchor: { start: 1, end: 2 } }] });
    expect(d.questions[0].status).toBe('todo');
    expect(d.questions[0].card.box).toBe(0);
    expect(() => parseData(null)).toThrow();
    expect(() => parseData({ foo: 1 })).toThrow();
  });
});

describe('export / search / srs', () => {
  const data = (() => {
    const d = emptyData();
    d.interviews.push(createInterview({ id: 'i', company: 'ACME', title: '一次面接', date: '2026-11-10' }));
    d.questions.push(
      createQuestion('i', { id: 'r', text: '志望動機は？', answer: '御社のＡＩ事業に魅力を感じました。', keyPoints: '- AI事業\n- 成長性', tags: ['志望動機'] }),
      createQuestion('i', { id: 'c', parentId: 'r', text: 'なぜＡＩ？', anchor: { start: 3, end: 7, quote: 'ＡＩ事業' }, answer: '大学で研究したため' }),
    );
    return d;
  })();

  it('Markdown に深掘りの引用と要点が出る', () => {
    const md = toMarkdown(data);
    expect(md).toContain('# ACME / 一次面接');
    expect(md).toContain('## Q1. 志望動機は？');
    expect(md).toContain('### Q1-1. なぜＡＩ？');
    expect(md).toContain('> 深掘り元 Q1: 「ＡＩ事業」');
    expect(md).toContain('- 成長性');
  });

  it('全角半角・かな/カナを区別せず AND 検索できる', () => {
    expect(search(data, 'ai 事業').map((h) => h.question.id)).toEqual(['r']);
    expect(search(data, 'ナゼ').map((h) => h.question.id)).toEqual(['c']);
    expect(search(data, '', '志望動機').map((h) => h.question.id)).toEqual(['r']);
    expect(search(data, 'zzz')).toEqual([]);
  });

  it('単語帳: 期限の来たものが先、深掘りは除外できる、採点で箱が動く', () => {
    const q = data.questions.map((x) => ({ ...x }));
    q[0].card = { box: 2, due: '2099-01-01', seen: 1 };
    const opts = { includeDeepDives: true, onlyDue: false, shuffle: false };
    expect(buildDeck(q, opts, '2026-11-06').map((x) => x.id)).toEqual(['c', 'r']);
    expect(buildDeck(q, { ...opts, includeDeepDives: false }, '2026-11-06').map((x) => x.id)).toEqual(['r']);
    expect(buildDeck(q, { ...opts, onlyDue: true }, '2026-11-06').map((x) => x.id)).toEqual(['c']);
    const up = gradeCard({ box: 1, due: null, seen: 0 }, true, '2026-11-06');
    expect(up).toEqual({ box: 2, due: '2026-11-09', seen: 1 });
    expect(gradeCard(up, false, '2026-11-06').box).toBe(0);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});
