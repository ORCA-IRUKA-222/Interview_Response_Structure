/**
 * 認識結果を発話の区切りをまたいで繋ぎ、直近の発話を 1 本の文字列として保持する。
 * 確定結果を溜めておき「確定分 + 途中経過」を現在の発話として扱う。maxChars で頭から切り捨てる。
 */
export class SpeechBuffer {
  private committed = '';
  private partial = '';

  constructor(private readonly maxChars = 240) {}

  updatePartial(text: string) {
    this.partial = text.trim();
  }

  commit(text: string) {
    const t = text.trim();
    if (t) {
      this.committed = this.committed ? `${this.committed} ${t}` : t;
      if (this.committed.length > this.maxChars) {
        this.committed = this.committed.slice(this.committed.length - this.maxChars);
      }
    }
    this.partial = '';
  }

  current(): string {
    if (!this.partial) return this.committed;
    if (!this.committed) return this.partial;
    return `${this.committed} ${this.partial}`;
  }

  clear() {
    this.committed = '';
    this.partial = '';
  }
}
