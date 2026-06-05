import { checkMessage } from '../src/utils/classifier'

describe('checkMessage', () => {
  const keywords = ['bitcoin', 'forex', 'invest', 'make money']

  it('returns matched keywords for spam text', () => {
    expect(checkMessage('Buy BITCOIN now!', keywords)).toEqual(['bitcoin'])
  })

  it('returns empty array for clean text', () => {
    expect(checkMessage('Hello everyone, nice day!', keywords)).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(checkMessage('Great FOREX opportunity', keywords)).toEqual(['forex'])
  })

  it('returns all matched keywords when multiple match', () => {
    expect(checkMessage('invest in bitcoin today', keywords)).toEqual(['bitcoin', 'invest'])
  })

  it('does not match keyword inside a longer word', () => {
    expect(checkMessage('reinvesting profits', keywords)).toEqual([])
  })

  it('does not match partial prefix (e.g. stock in stockings)', () => {
    expect(checkMessage('I love stockings', ['stock'])).toEqual([])
  })

  it('does not match partial suffix (e.g. invest in investment)', () => {
    expect(checkMessage('great investment idea', ['invest'])).toEqual([])
  })

  it('matches keyword at start of string', () => {
    expect(checkMessage('bitcoin is rising', keywords)).toEqual(['bitcoin'])
  })

  it('matches keyword at end of string', () => {
    expect(checkMessage('buy bitcoin', keywords)).toEqual(['bitcoin'])
  })

  it('uses SPAM_KEYWORDS by default', () => {
    const result = checkMessage('Check out this nft drop')
    expect(result).toContain('nft')
  })
})