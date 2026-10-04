/**
 * JSON.parse that forgives the slips models make in fenced blocks: comments, trailing commas,
 * smart quotes, a stray ```json fence, and numbers written with thousands separators (4,160.50).
 * Returns undefined when it still can't be read.
 */
export function parseLooseJson(input: string): unknown {
  const attempts = [input];
  let s = input.trim().replace(/^json\s*/i, "");
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = repairOutsideStrings(s);
  attempts.push(s);
  // Last resort: the outermost {...} or [...] in the text.
  const obj = s.match(/[{[][\s\S]*[}\]]/);
  if (obj) attempts.push(obj[0]);
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {}
  }
  return undefined;
}

/** Index just past the string literal that opens at `from` (the end of the text if it never closes). */
function stringEnd(text: string, from: number) {
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return i + 1;
  }
  return text.length;
}

/** Strips comments, trailing commas and thousands separators, but never inside a string ("a // b" is a label, not a comment). */
function repairOutsideStrings(text: string) {
  let out = "";
  let code = "";
  const flush = () => {
    out += code
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/:\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?=\s*[,}\]])/g, (_, n: string) => `: ${n.replace(/,/g, "")}`);
    code = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      flush();
      const end = stringEnd(text, i);
      out += text.slice(i, end);
      i = end - 1;
    } else if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = (nl < 0 ? text.length : nl) - 1;
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close < 0 ? text.length : close + 1;
    } else code += c;
  }
  flush();
  return out;
}
