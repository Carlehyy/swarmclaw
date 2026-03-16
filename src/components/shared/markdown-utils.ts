/** Detect if text contains structured markdown (code blocks, headings, lists, tables) */
export function isStructuredMarkdown(text: string): boolean {
  if (!text) return false
  return /```/.test(text)
    || /^#{1,4}\s/m.test(text)
    || /^[-*]\s/m.test(text)
    || /^\d+\.\s/m.test(text)
    || /\|.*\|.*\|/m.test(text)
}
