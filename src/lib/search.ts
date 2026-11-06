import type { Data, Interview, Question } from '../types';
import { normalize, normalizeToString } from './text/normalizer';

export interface SearchHit {
  question: Question;
  interview: Interview;
  /** どこに当たったか */
  field: 'text' | 'answer' | 'keyPoints' | 'tags' | 'interview';
  snippet: string;
}

/** 全角/半角・ひらがな/カタカナ・大小文字を無視して検索する。空白区切りは AND */
export function search(data: Data, query: string, tag?: string): SearchHit[] {
  const terms = query
    .split(/\s+/)
    .map(normalizeToString)
    .filter(Boolean);
  if (terms.length === 0 && !tag) return [];

  const interviews = new Map(data.interviews.map((i) => [i.id, i]));
  const hits: SearchHit[] = [];

  for (const q of data.questions) {
    const interview = interviews.get(q.interviewId);
    if (!interview) continue;
    if (tag && !q.tags.includes(tag)) continue;

    const fields: [SearchHit['field'], string][] = [
      ['text', q.text],
      ['answer', q.answer],
      ['keyPoints', q.keyPoints],
      ['tags', q.tags.join(' ')],
      ['interview', `${interview.company} ${interview.title}`],
    ];
    const normalized = fields.map(([f, s]) => [f, s, normalize(s)] as const);
    const joined = normalized.map(([, , n]) => n.chars.join('')).join('\u0000');

    if (!terms.every((t) => joined.includes(t))) continue;

    // 先頭の語が最初に当たったフィールドでスニペットを作る
    let field: SearchHit['field'] = 'text';
    let snippet = q.text;
    if (terms.length) {
      for (const [f, raw, n] of normalized) {
        const flat = n.chars.join('');
        const at = flat.indexOf(terms[0]);
        if (at < 0) continue;
        field = f;
        snippet = makeSnippet(raw, n.sourceIndex[at] ?? 0);
        break;
      }
    }
    hits.push({ question: q, interview, field, snippet });
  }
  return hits.sort((a, b) => fieldRank(a.field) - fieldRank(b.field));
}

function fieldRank(f: SearchHit['field']): number {
  return { text: 0, keyPoints: 1, answer: 2, tags: 3, interview: 4 }[f];
}

function makeSnippet(raw: string, at: number, radius = 36): string {
  const start = Math.max(0, at - radius);
  const end = Math.min(raw.length, at + radius);
  const body = raw.slice(start, end).replace(/\s+/g, ' ');
  return `${start > 0 ? '…' : ''}${body}${end < raw.length ? '…' : ''}`;
}
