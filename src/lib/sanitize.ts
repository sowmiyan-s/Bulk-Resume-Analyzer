/**
 * Regex pre-processing for text pulled out of PDFs / DOCX / OCR.
 *
 * Two goals:
 *  1. Repair the glitches that PDF and OCR extraction reliably introduce
 *     (ligatures, broken bullets, 0/O confusion inside words, hyphen wrapping).
 *  2. Shrink the text so we spend as few LLM tokens as possible per resume.
 *
 * Every repair is also *reported* so the Rectify drawer can show the officer
 * exactly what was auto-corrected and what still looks suspicious.
 */

export type TextFix = {
  kind: string;
  before: string;
  after: string;
  count: number;
};

export type SanitizeResult = {
  clean: string;
  fixes: TextFix[];
  /** Suspicious spots we did NOT auto-change — surfaced for human review. */
  warnings: string[];
  stats: { rawChars: number; cleanChars: number; savedChars: number };
};

/** Ligatures and “smart” punctuation that ATS parsers and LLMs both dislike. */
const CHAR_MAP: Array<[RegExp, string, string]> = [
  [/\uFB00/g, "ff", "ligature ﬀ"],
  [/\uFB01/g, "fi", "ligature ﬁ"],
  [/\uFB02/g, "fl", "ligature ﬂ"],
  [/\uFB03/g, "ffi", "ligature ﬃ"],
  [/\uFB04/g, "ffl", "ligature ﬄ"],
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'", "smart quote"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"', "smart double quote"],
  [/[\u2013\u2014\u2015]/g, "-", "en/em dash"],
  [/\u2026/g, "...", "ellipsis"],
  [/\u00A0/g, " ", "non-breaking space"],
  [/[\u200B-\u200D\uFEFF]/g, "", "zero-width char"],
  [/[\u2022\u25CF\u25AA\u25E6\u2043\u00B7\u2219]/g, "* ", "bullet glyph"],
];

/** Bullet-ish leftovers OCR produces when it cannot read a real bullet. */
const BROKEN_BULLET = /^[\s]*(?:[o0OØ•·▪–—*+·]|[|]{1,2}|[lI])[\s]{1,4}(?=[A-Z(])/gm;

function tally(fixes: TextFix[], kind: string, before: string, after: string, count: number) {
  if (count <= 0) return;
  const existing = fixes.find((f) => f.kind === kind);
  if (existing) existing.count += count;
  else fixes.push({ kind, before, after, count });
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
  return m ? m.length : 0;
}

export function sanitizeResumeText(raw: string): SanitizeResult {
  const rawChars = raw.length;
  let text = raw;
  const fixes: TextFix[] = [];
  const warnings: string[] = [];

  // 1. Normalise unicode so accented chars and ligatures behave predictably.
  try {
    text = text.normalize("NFKC");
  } catch {
    /* older engines — safe to skip */
  }

  // 2. Line endings first, so every later line-anchored regex works.
  text = text.replace(/\r\n?/g, "\n");

  // 3. Character-level repairs.
  for (const [re, replacement, label] of CHAR_MAP) {
    const n = countMatches(text, re);
    if (n) {
      text = text.replace(re, replacement);
      tally(fixes, label, "", replacement.trim(), n);
    }
  }

  // 4. De-hyphenate words split across a line break ("engi-\nneering").
  {
    const re = /([a-z])-\n([a-z])/g;
    const n = countMatches(text, re);
    if (n) {
      text = text.replace(re, "$1$2");
      tally(fixes, "hyphen line-wrap", "word-\\nword", "wordword", n);
    }
  }

  // 5. Broken bullet markers -> a single canonical "* ".
  {
    const n = countMatches(text, BROKEN_BULLET);
    if (n) {
      text = text.replace(BROKEN_BULLET, "* ");
      tally(fixes, "broken bullet marker", "o / | / l", "* ", n);
    }
  }

  // 6. Digit/letter confusion — ONLY inside alphabetic words, never in numbers,
  //    so we don't corrupt real metrics like "40%" or years like "2024".
  {
    // 0 used as O inside a word: "T0ols", "Pyth0n"
    const zeroInWord = /(?<=[A-Za-z]{2})0(?=[A-Za-z])|(?<=[A-Za-z])0(?=[A-Za-z]{2})/g;
    const n = countMatches(text, zeroInWord);
    if (n) {
      text = text.replace(zeroInWord, "o");
      tally(fixes, "digit 0 inside word -> o", "Pyth0n", "Python", n);
    }
  }
  {
    // 1 used as l/I inside a word: "Deve1oper"
    const oneInWord = /(?<=[a-z]{2})1(?=[a-z])/g;
    const n = countMatches(text, oneInWord);
    if (n) {
      text = text.replace(oneInWord, "l");
      tally(fixes, "digit 1 inside word -> l", "Deve1oper", "Developer", n);
    }
  }
  {
    // 5 used as S at the start of a capitalised word: "5QL"
    const fiveAsS = /\b5(?=[A-Z]{2})/g;
    const n = countMatches(text, fiveAsS);
    if (n) {
      text = text.replace(fiveAsS, "S");
      tally(fixes, "digit 5 -> S", "5QL", "SQL", n);
    }
  }
  {
    // Digit at the START of a word, where the rest is clearly a word:
    // "0ptimized" -> "Optimized", "1eadership" -> "leadership", "5ystem" -> "System".
    // Guarded by a 3+ lowercase-letter tail so real numbers ("5 years", "0.5") are safe.
    const zeroStart = /\b0(?=[a-z]{3,})/g;
    const n = countMatches(text, zeroStart);
    if (n) {
      text = text.replace(zeroStart, "O");
      tally(fixes, "digit 0 starting word -> O", "0ptimized", "Optimized", n);
    }
  }
  {
    const oneStart = /\b1(?=[a-z]{3,})/g;
    const n = countMatches(text, oneStart);
    if (n) {
      text = text.replace(oneStart, "l");
      tally(fixes, "digit 1 starting word -> l", "1eadership", "leadership", n);
    }
  }
  {
    // 5 used as S at the start of a lowercase word: "5ystem" -> "System"
    const fiveStart = /\b5(?=[a-z]{3,})/g;
    const n = countMatches(text, fiveStart);
    if (n) {
      text = text.replace(fiveStart, "S");
      tally(fixes, "digit 5 starting word -> S", "5ystem", "System", n);
    }
  }
  {
    // Capital O used as zero inside a number: "1O0%" / "2O24"
    const oInNumber = /(?<=\d)O(?=\d)|(?<=\d)O\b/g;
    const n = countMatches(text, oInNumber);
    if (n) {
      text = text.replace(oInNumber, "0");
      tally(fixes, "letter O inside number -> 0", "2O24", "2024", n);
    }
  }

  // 7. Bullet markers again — digit repair above can reveal bullets that were
  //    hidden behind a glitched word ("o 0ptimized" only looks like a bullet
  //    once "0ptimized" has become "Optimized").
  {
    const n = countMatches(text, BROKEN_BULLET);
    if (n) {
      text = text.replace(BROKEN_BULLET, "* ");
      tally(fixes, "broken bullet marker", "o / | / l", "* ", n);
    }
  }

  // 8. Collapse whitespace — the single biggest token saving on PDF text.
  {
    const before = text.length;
    text = text
      .replace(/[ \t]{2,}/g, " ") // runs of spaces from column layouts
      .replace(/ +\n/g, "\n") // trailing spaces
      .replace(/\n{3,}/g, "\n\n") // more than one blank line
      .replace(/^\s+|\s+$/g, "");
    const saved = before - text.length;
    if (saved > 0)
      tally(fixes, "collapsed whitespace", `${before} chars`, `${text.length} chars`, saved);
  }

  // 8. Space before punctuation ("Python , Java") — common in PDF extraction.
  {
    const re = / +([,.;:%)])/g;
    const n = countMatches(text, re);
    if (n) {
      text = text.replace(re, "$1");
      tally(fixes, "space before punctuation", "Python , Java", "Python, Java", n);
    }
  }

  // 9. Glue a wrapped bullet continuation back onto its bullet line so the LLM
  //    sees one coherent achievement per line instead of fragments.
  text = text.replace(/\n(?![*\-\u2022]|\s*$|[A-Z][A-Z ]{3,}$)([a-z,;)])/g, " $1");

  // --- warnings: things a human should look at, that we refuse to guess on ---
  if (!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text))
    warnings.push("No email address detected in the resume text.");
  if (!/(?:\+?\d[\d\s\-()]{7,}\d)/.test(text)) warnings.push("No phone number detected.");
  if (text.replace(/\s/g, "").length < 400)
    warnings.push("Very little text extracted — the file may be a scan or mostly images.");
  if (/(.)\1{6,}/.test(text))
    warnings.push("Long repeated-character runs found — likely an OCR artifact.");
  const capsRatio =
    (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(1, text.match(/[A-Za-z]/g)?.length ?? 1);
  if (capsRatio > 0.55)
    warnings.push("Text is mostly uppercase — ATS keyword matching may suffer.");
  if (/\t/.test(raw) || /\|\s*\w+\s*\|/.test(raw))
    warnings.push("Table-like structure detected — many ATS parsers cannot read tables.");

  return {
    clean: text,
    fixes,
    warnings,
    stats: { rawChars, cleanChars: text.length, savedChars: rawChars - text.length },
  };
}

/**
 * Hard cap the text we send to the model. Keeps the head (contact, summary,
 * skills) and the tail (education) because the middle of a long resume is the
 * cheapest thing to lose. Saves tokens on the 6-page resumes students submit.
 */
export function capForPrompt(text: string, maxChars = 9000): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.72);
  const tail = maxChars - head - 40;
  return `${text.slice(0, head)}\n\n[...trimmed for length...]\n\n${text.slice(-tail)}`;
}
