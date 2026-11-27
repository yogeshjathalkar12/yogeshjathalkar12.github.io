// Splitting what was said into words, in any script, and finding phrases in it. The same rules as the PC app's raptor/calls/words.py: the two
// are checked against the same list of cases (tests/fixtures/call_words.json).
//
//  * a word is a run of letters, marks (the vowel signs of Indian scripts are "marks") and digits, with apostrophes inside it;
//  * scripts written without spaces (Chinese, Japanese) count one word per character;
//  * capitals, accents on Latin letters, the Hindi nukta and chandrabindu, curly apostrophes and invisible joiners are ignored.

const APOSTROPHES: Record<string, string> = { '’': "'", '‘': "'", 'ʼ': "'", '´': "'", '`': "'" };
const DROP = new Set(['़', '‌', '‍', '﻿']);
const SAME: Record<string, string> = { 'ँ': 'ं', 'ঁ': 'ং' };

const MARK = /\p{M}/u;
const IN_WORD = /[\p{L}\p{M}\p{N}]/u;
const LATIN = /\p{Script=Latin}/u;

const noSpaces = (ch: string) => {
  const code = ch.codePointAt(0) as number;
  return (code >= 0x3040 && code <= 0x30ff) || (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && code <= 0x2fa1f);
};

const fold = (text: string) => text.toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ');

export function normalise(text: string): string {
  let out = '';
  let latinBase = false;
  for (let ch of fold(text || '').normalize('NFKD')) {
    if (MARK.test(ch)) {
      if (latinBase) continue; // an accent on a Latin letter
    } else {
      latinBase = (ch.codePointAt(0) as number) < 128 || LATIN.test(ch);
    }
    ch = APOSTROPHES[ch] ?? ch;
    if (DROP.has(ch)) continue;
    out += SAME[ch] ?? ch;
  }
  return out.normalize('NFC');
}

export function tokens(text: string): string[] {
  const found: string[] = [];
  let current = '';
  const close = () => {
    const word = current.replace(/^'+|'+$/g, '');
    if (word) found.push(word);
    current = '';
  };
  for (const ch of normalise(text)) {
    if (noSpaces(ch)) {
      close();
      found.push(ch);
    } else if (ch === "'" || IN_WORD.test(ch)) current += ch;
    else close();
  }
  close();
  return found;
}

export const countWords = (text: string) => tokens(text).length;

// a plain English-style plural still matches: "budgets" for "budget"
const sameWord = (heard: string, wanted: string) => heard === wanted || (/^[\x00-\x7f]+$/.test(wanted) && wanted.length > 3 && heard === `${wanted}s`);

/** Where `phrase` starts among the heard words, or -1. Whole words only: "cost" is not found in "costume". */
export function findIn(heard: string[], phrase: string): number {
  const wanted = tokens(phrase);
  if (!wanted.length || wanted.length > heard.length) return -1;
  for (let start = 0; start <= heard.length - wanted.length; start += 1) {
    if (wanted.every((w, i) => sameWord(heard[start + i], w))) return start;
  }
  return -1;
}

export const firstOf = (text: string, phrases: string[]): string | null => {
  const heard = tokens(text);
  return phrases.find((p) => findIn(heard, p) >= 0) ?? null;
};

/** How many times any of the phrases is said. Overlapping phrases count the same words once. */
export function countOf(text: string, phrases: string[]): number {
  const heard = tokens(text);
  const taken = new Set<number>();
  let total = 0;
  const longestFirst = [...new Set(phrases)].map((p) => tokens(p)).sort((a, b) => b.length - a.length);
  for (const wanted of longestFirst) {
    if (!wanted.length) continue;
    for (let start = 0; start <= heard.length - wanted.length; start += 1) {
      const free = wanted.every((_, i) => !taken.has(start + i));
      if (free && wanted.every((w, i) => sameWord(heard[start + i], w))) {
        wanted.forEach((_, i) => taken.add(start + i));
        total += 1;
      }
    }
  }
  return total;
}
