import { parseKeywords } from '../src/handlers/group'

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
