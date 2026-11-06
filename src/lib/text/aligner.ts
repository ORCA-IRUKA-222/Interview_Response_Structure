import { normalize, type NormalizedText } from './normalizer';

/**
 * 音声認識の結果を原稿に突き合わせて「どこまで読んだか」を進める
 * （発表アシスタント ScriptAligner の移植）。
 *
 * 直近の発話（末尾 N 文字）を現在位置まわりの窓に対して半グローバル・アライメントし、
 * 発話が一番うまく説明できる終端位置を新しい既読位置とする。
 *  - 原稿側を飛ばす = 読み飛ばし   → skipPenalty
 *  - 発話側が余る   = 相槌や雑音   → insertPenalty
 *  - 文字が食い違う = 認識ゆれ     → substitutePenalty
 * 一致率が minMatchRatio を下回るときは位置を動かさない。位置は前進のみ。
 */
export interface AlignerConfig {
  tailLength: number;
  lookAhead: number;
  lookBack: number;
  minMatchRatio: number;
  minSpokenChars: number;
  skipPenalty: number;
  insertPenalty: number;
  substitutePenalty: number;
}

const BALANCED: AlignerConfig = {
  tailLength: 32,
  lookAhead: 200,
  lookBack: 48,
  minMatchRatio: 0.48,
  minSpokenChars: 4,
  skipPenalty: 0.34,
  insertPenalty: 0.34,
  substitutePenalty: 0.6,
};

export const ALIGNER_PRESETS: Record<0 | 1 | 2, AlignerConfig> = {
  /** 誤って進みにくい代わりに、認識が荒いと止まりやすい */
  0: { ...BALANCED, minMatchRatio: 0.62, lookAhead: 150 },
  1: BALANCED,
  /** 認識が荒くても進む代わりに、似た表現の箇所へ飛ぶことがある */
  2: { ...BALANCED, minMatchRatio: 0.34, lookAhead: 280 },
};

export class ScriptAligner {
  readonly normalized: NormalizedText;
  cursor = 0;

  constructor(
    readonly scriptText: string,
    public config: AlignerConfig = BALANCED,
  ) {
    this.normalized = normalize(scriptText);
  }

  get totalUnits() {
    return this.normalized.chars.length;
  }

  get isFinished() {
    return this.totalUnits === 0 || this.cursor >= this.totalUnits;
  }

  /** 元テキスト上の既読の終端。この位置より手前を「読んだ」色で塗る */
  readBoundaryInSource(): number {
    const n = this.totalUnits;
    if (n === 0 || this.cursor <= 0) return 0;
    if (this.cursor >= n) return this.scriptText.length;
    return this.normalized.sourceIndex[this.cursor];
  }

  progress(): number {
    return this.totalUnits === 0 ? 0 : this.cursor / this.totalUnits;
  }

  reset() {
    this.cursor = 0;
  }

  finish() {
    this.cursor = this.totalUnits;
  }

  /** 元テキストの位置を指定して既読位置を移動する（タップ・文送りなどの手動操作用） */
  seekToSource(sourceIndex: number) {
    const n = this.totalUnits;
    if (n === 0) return;
    if (sourceIndex >= this.scriptText.length) {
      this.cursor = n;
      return;
    }
    let low = 0;
    let high = n;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.normalized.sourceIndex[mid] < sourceIndex) low = mid + 1;
      else high = mid;
    }
    this.cursor = low;
  }

  /** 直近の発話を取り込み、既読位置を更新する。前進したら true */
  consume(utterance: string): boolean {
    if (this.isFinished) return false;
    const cfg = this.config;
    const spokenAll = normalize(utterance).chars;
    // 短すぎる発話は偶然の一致を拾うので使わない（原稿自体が短い場合は除く）
    if (spokenAll.length < Math.min(cfg.minSpokenChars, this.totalUnits)) return false;

    const spoken =
      spokenAll.length <= cfg.tailLength ? spokenAll : spokenAll.slice(spokenAll.length - cfg.tailLength);

    const windowStart = Math.max(0, this.cursor - cfg.lookBack);
    const windowEnd = Math.min(this.totalUnits, this.cursor + cfg.lookAhead);
    if (windowEnd <= windowStart) return false;

    const match = this.align(spoken, windowStart, windowEnd);
    if (!match || match.ratio < cfg.minMatchRatio) return false;

    const newCursor = windowStart + match.endInWindow;
    if (newCursor <= this.cursor) return false;
    this.cursor = Math.min(newCursor, this.totalUnits);
    return true;
  }

  /** spoken を script[windowStart, windowEnd) に半グローバルに整列。開始は無償、終端は自由 */
  private align(spoken: string[], windowStart: number, windowEnd: number) {
    const m = spoken.length;
    const w = windowEnd - windowStart;
    if (m === 0 || w === 0) return null;
    const script = this.normalized.chars;
    const { insertPenalty, skipPenalty, substitutePenalty } = this.config;

    let previous = new Float64Array(w + 1);
    let current = new Float64Array(w + 1);
    for (let i = 1; i <= m; i++) {
      current[0] = -insertPenalty * i;
      const sc = spoken[i - 1];
      for (let j = 1; j <= w; j++) {
        const diagonal = previous[j - 1] + (script[windowStart + j - 1] === sc ? 1 : -substitutePenalty);
        const skipScript = current[j - 1] - skipPenalty;
        const extraSpeech = previous[j] - insertPenalty;
        current[j] = Math.max(diagonal, skipScript, extraSpeech);
      }
      const swap = previous;
      previous = current;
      current = swap;
    }

    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let j = 0; j <= w; j++) {
      if (previous[j] > bestScore) {
        bestScore = previous[j];
        bestIndex = j;
      }
    }
    return { endInWindow: bestIndex, ratio: bestScore / m };
  }
}
