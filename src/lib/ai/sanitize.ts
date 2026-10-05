// Last line of defence for "never reveal the model": scrub vendor/model names
// from the streamed output. The system prompt does the real work; this catches slips.

const PATTERN =
  /\b(claude(?:[\s-]*(?:opus|sonnet|haiku|fable))?(?:[\s-]*\d+(?:[.-]\d+)*)?|anthropic|opus[\s-]*\d+(?:\.\d+)?|sonnet[\s-]*\d+(?:\.\d+)?|haiku[\s-]*\d+(?:\.\d+)?|qwen[\w.-]*|tongyi|openrouter|open[\s-]?code(?:\s*go)?|gemma[\w.-]*|gemini[\w.-]*|nemotron[\w.-]*|chatgpt|gpt[\s-]?\d[\w.-]*|llama[\s-]?\d[\w.-]*|deepseek[\w.-]*|mistral[\w.-]*|glm[\s-]?\d[\w.-]*|kimi[\w.-]*|minimax[\w.-]*|openai|alibaba(?:\s*cloud)?|dashscope|bailian|inclusion[\s-]?ai|ant\s*group|ling[\s-]?\d[\w.-]*|nvidia|grok[\w.-]*|xai|xiaomi|mimo[\w.-]*|inkling[\w.-]*|thinking\s*machines)\b/gi;

export function scrub(text: string) {
  return text.replace(PATTERN, "SobatFX AI").replace(/SobatFX AI(\s+SobatFX AI)+/g, "SobatFX AI");
}

/** Streaming version: holds back the trailing partial word so names split across chunks still match. */
export function streamScrubber() {
  let buf = "";
  return {
    push(chunk: string) {
      buf += chunk;
      if (buf.length < 48) return "";
      // Emit up to the last whitespace that leaves >= 24 chars (enough for "claude opus 5.5") buffered.
      let cut = -1;
      for (let i = buf.length - 24; i > 0; i--) {
        if (/\s/.test(buf[i])) {
          cut = i;
          break;
        }
      }
      if (cut <= 0) {
        if (buf.length < 400) return "";
        cut = buf.length - 24;
      }
      const out = scrub(buf.slice(0, cut));
      buf = buf.slice(cut);
      return out;
    },
    flush() {
      const out = scrub(buf);
      buf = "";
      return out;
    },
  };
}
