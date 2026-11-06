import type { Question } from '../types';

/** ライトナー式の簡易復習間隔（日）。box 0 は「もう一度」で同日中に再出題 */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];

export function todayString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return todayString(new Date(y, m - 1, d + days));
}

export function gradeCard(card: Question['card'], known: boolean, today = todayString()): Question['card'] {
  const box = known ? Math.min(card.box + 1, BOX_INTERVAL_DAYS.length - 1) : 0;
  return { box, due: addDays(today, BOX_INTERVAL_DAYS[box]), seen: card.seen + 1 };
}

export function isDue(card: Question['card'], today = todayString()): boolean {
  return card.due === null || card.due <= today;
}

export interface DeckOptions {
  interviewId?: string;
  tag?: string;
  includeDeepDives: boolean;
  onlyDue: boolean;
  shuffle: boolean;
}

export function hasCardContent(q: Question): boolean {
  return q.text.trim() !== '' && (q.answer.trim() !== '' || q.keyPoints.trim() !== '');
}

/** 出題順: 期限が来ているもの(箱の浅い順) → それ以外。同条件内は shuffle なら無作為 */
export function buildDeck(
  questions: Question[],
  opts: DeckOptions,
  today = todayString(),
  random: () => number = Math.random,
): Question[] {
  let deck = questions.filter(hasCardContent);
  if (opts.interviewId) deck = deck.filter((q) => q.interviewId === opts.interviewId);
  if (opts.tag) deck = deck.filter((q) => q.tags.includes(opts.tag!));
  if (!opts.includeDeepDives) deck = deck.filter((q) => q.parentId === null);
  if (opts.onlyDue) deck = deck.filter((q) => isDue(q.card, today));

  const keyed = deck.map((q) => ({
    q,
    due: isDue(q.card, today) ? 0 : 1,
    noise: opts.shuffle ? random() : 0,
  }));
  keyed.sort((a, b) => a.due - b.due || a.q.card.box - b.q.card.box || a.noise - b.noise || a.q.order - b.q.order);
  return keyed.map((k) => k.q);
}
