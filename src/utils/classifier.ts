import { SPAM_KEYWORDS } from '../config'

export function checkMessage(text: string, keywords: string[] = SPAM_KEYWORDS): string[] {
  const lower = text.toLowerCase()
  return keywords.filter(kw => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`).test(lower)
  })
}
