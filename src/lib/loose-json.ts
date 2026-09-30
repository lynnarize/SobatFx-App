/**
 * JSON.parse that forgives the slips models make in fenced blocks: comments, trailing commas,
 * smart quotes, a stray ```json fence, and numbers written with thousands separators (4,160.50).
 * Returns undefined when it still can't be read.
 */
export function parseLooseJson(input: string): unknown {
  const attempts = [input];
  let s = input.trim().replace(/^json\s*/i, "");
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/:\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?=\s*[,}\]])/g, (_, n: string) => `: ${n.replace(/,/g, "")}`);
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
