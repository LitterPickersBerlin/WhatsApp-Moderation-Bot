import { parseKeywords, extractText } from '../src/handlers/group'
import type { WAMessage } from '@whiskeysockets/baileys'

describe('parseKeywords (group)', () => {
  it('strips @mentions before parsing', () => {
    expect(parseKeywords('@000000000000 job vacancy')).toEqual(['job', 'vacancy'])
  })

  it('extracts quoted phrase after stripping mentions', () => {
    expect(parseKeywords('@000000000000 "toilet roll"')).toEqual(['toilet roll'])
  })

  it('handles mixed quoted and unquoted after mention', () => {
    expect(parseKeywords('@bot "job vacancy" driver')).toEqual(['job vacancy', 'driver'])
  })

  it('handles multiple quoted phrases', () => {
    expect(parseKeywords('"toilet roll" "job vacancy"')).toEqual(['toilet roll', 'job vacancy'])
  })

  it('ignores single-character tokens', () => {
    expect(parseKeywords('a b dog')).toEqual(['dog'])
  })

  it('returns empty array for only a mention', () => {
    expect(parseKeywords('@447700000000')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseKeywords('')).toEqual([])
  })

  it('handles no mention, plain words', () => {
    expect(parseKeywords('bitcoin forex')).toEqual(['bitcoin', 'forex'])
  })
})

function msg(message: WAMessage['message']): WAMessage {
  return { key: {}, message } as WAMessage
}

describe('extractText', () => {
  it('extracts plain conversation text', () => {
    expect(extractText(msg({ conversation: 'hello' }))).toBe('hello')
  })

  it('extracts extended text message', () => {
    expect(extractText(msg({ extendedTextMessage: { text: 'check this link' } }))).toBe('check this link')
  })

  it('extracts image caption', () => {
    expect(extractText(msg({ imageMessage: { caption: 'bitcoin opportunity' } as any }))).toBe('bitcoin opportunity')
  })

  it('extracts video caption', () => {
    expect(extractText(msg({ videoMessage: { caption: 'invest now' } as any }))).toBe('invest now')
  })

  it('extracts document caption', () => {
    expect(extractText(msg({ documentMessage: { caption: 'forex guide' } as any }))).toBe('forex guide')
  })

  it('returns empty string for messages with no text', () => {
    expect(extractText(msg({ imageMessage: {} as any }))).toBe('')
  })

  it('returns empty string for null message', () => {
    expect(extractText(msg(undefined))).toBe('')
  })

  it('prefers conversation over other fields', () => {
    expect(extractText(msg({
      conversation: 'plain text',
      extendedTextMessage: { text: 'should not appear' },
    }))).toBe('plain text')
  })
})
