import { parseKeywords, EMOJI_ONLY } from '../src/handlers/dm'

describe('parseKeywords (DM)', () => {
  it('splits unquoted words', () => {
    expect(parseKeywords('dog cat bird')).toEqual(['dog', 'cat', 'bird'])
  })

  it('extracts a single quoted phrase', () => {
    expect(parseKeywords('"toilet roll"')).toEqual(['toilet roll'])
  })

  it('handles mixed quoted and unquoted', () => {
    expect(parseKeywords('"toilet roll" dog monkey')).toEqual(['toilet roll', 'dog', 'monkey'])
  })

  it('handles multiple quoted phrases', () => {
    expect(parseKeywords('"job vacancy" "toilet roll"')).toEqual(['job vacancy', 'toilet roll'])
  })

  it('ignores single-character tokens', () => {
    expect(parseKeywords('a b cat')).toEqual(['cat'])
  })

  it('returns empty array for empty string', () => {
    expect(parseKeywords('')).toEqual([])
  })

  it('returns empty array for only whitespace', () => {
    expect(parseKeywords('   ')).toEqual([])
  })

  it('does not include empty quoted phrases', () => {
    expect(parseKeywords('""  dog')).toEqual(['dog'])
  })
})

describe('EMOJI_ONLY regex', () => {
  it('matches a simple emoji', () => {
    expect(EMOJI_ONLY.test('👍')).toBe(true)
  })

  it('matches emoji with skin tone modifier', () => {
    expect(EMOJI_ONLY.test('👍🏽')).toBe(true)
  })

  it('matches ZWJ sequence', () => {
    expect(EMOJI_ONLY.test('👨‍👩‍👧')).toBe(true)
  })

  it('matches multiple emoji', () => {
    expect(EMOJI_ONLY.test('🎉🔥💯')).toBe(true)
  })

  it('does not match plain text', () => {
    expect(EMOJI_ONLY.test('hello')).toBe(false)
  })

  it('does not match emoji mixed with text', () => {
    expect(EMOJI_ONLY.test('hi 👍')).toBe(false)
  })

  it('does not match empty string', () => {
    expect(EMOJI_ONLY.test('')).toBe(false)
  })

  it('matches emoji with variation selector', () => {
    expect(EMOJI_ONLY.test('❤️')).toBe(true)
  })
})

describe('help command regex', () => {
  const HELP_RE = /^\/?(help|commands?)$/i

  it('matches "help"', () => expect(HELP_RE.test('help')).toBe(true))
  it('matches "/help"', () => expect(HELP_RE.test('/help')).toBe(true))
  it('matches "HELP"', () => expect(HELP_RE.test('HELP')).toBe(true))
  it('matches "commands"', () => expect(HELP_RE.test('commands')).toBe(true))
  it('matches "command"', () => expect(HELP_RE.test('command')).toBe(true))
  it('matches "/commands"', () => expect(HELP_RE.test('/commands')).toBe(true))
  it('does not match "help me"', () => expect(HELP_RE.test('help me')).toBe(false))
  it('does not match "/alert"', () => expect(HELP_RE.test('/alert')).toBe(false))
})
