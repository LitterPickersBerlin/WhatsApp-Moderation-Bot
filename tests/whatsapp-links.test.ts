import {
  findWhatsappLinks,
  extractNativeInvite,
  resolveForeignLinks,
  clearInviteCache,
} from '../src/utils/whatsappLinks'
import { extractText } from '../src/handlers/group'
import type { WAMessage } from '@whiskeysockets/baileys'

const CODE = 'AbCdEfGhIjKlMnOpQrStUv' // 22 chars, like a real invite code

describe('findWhatsappLinks', () => {
  it('detects a plain group invite link and extracts the code', () => {
    const hits = findWhatsappLinks(`join us https://chat.whatsapp.com/${CODE}`)
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('group-invite')
    expect(hits[0].inviteCode).toBe(CODE)
  })

  it('detects the legacy /invite/ path and links without a protocol', () => {
    expect(findWhatsappLinks(`chat.whatsapp.com/invite/${CODE}`)[0]?.inviteCode).toBe(CODE)
    expect(findWhatsappLinks(`chat.whatsapp.com/${CODE}`)[0]?.kind).toBe('group-invite')
  })

  it('dedupes the same link posted twice', () => {
    const text = `https://chat.whatsapp.com/${CODE} and again chat.whatsapp.com/${CODE}`
    expect(findWhatsappLinks(text)).toHaveLength(1)
  })

  it('catches links broken up with spaces, "(dot)" and zero-width characters', () => {
    expect(findWhatsappLinks(`chat . whatsapp . com/${CODE}`)).toHaveLength(1)
    expect(findWhatsappLinks(`chat(dot)whatsapp(dot)com/${CODE}`)).toHaveLength(1)
    expect(findWhatsappLinks(`chat.what​sapp.com/${CODE}`)).toHaveLength(1)
  })

  it('detects channel, wa.me, api.whatsapp.com, call, wa.link and deeplink formats', () => {
    const kinds = (t: string) => findWhatsappLinks(t).map(h => h.kind)
    expect(kinds('https://whatsapp.com/channel/0029VaAbCdEfGhIj12345')).toEqual(['channel'])
    expect(kinds('message me on wa.me/4915123456789')).toEqual(['chat-link'])
    expect(kinds('https://api.whatsapp.com/send?phone=4915123456789')).toEqual(['chat-link'])
    expect(kinds('https://call.whatsapp.com/voice/AbCdEfGh123')).toEqual(['call-link'])
    expect(kinds('https://wa.link/earnbig')).toEqual(['shortener'])
    expect(kinds('whatsapp://send?phone=4915123456789')).toEqual(['deeplink'])
  })

  it('ignores JIDs, bare domain mentions and lookalike domains', () => {
    expect(findWhatsappLinks('ping 4915123456789@s.whatsapp.net about it')).toHaveLength(0)
    expect(findWhatsappLinks('I prefer whatsapp.com over telegram')).toHaveLength(0)
    expect(findWhatsappLinks('our group chat. whatsapp is great. come along')).toHaveLength(0)
    expect(findWhatsappLinks('see sawa.me/profile for details')).toHaveLength(0)
  })

  it('returns nothing for empty text', () => {
    expect(findWhatsappLinks('')).toHaveLength(0)
  })
})

describe('extractNativeInvite', () => {
  it('detects a native group invite card', () => {
    const hit = extractNativeInvite({
      groupInviteMessage: { inviteCode: CODE, groupJid: '1@g.us', groupName: 'Crypto Kings' },
    })
    expect(hit?.kind).toBe('native-invite')
    expect(hit?.inviteCode).toBe(CODE)
    expect(hit?.groupName).toBe('Crypto Kings')
  })

  it('finds an invite card inside an ephemeral wrapper', () => {
    const hit = extractNativeInvite({
      ephemeralMessage: { message: { groupInviteMessage: { inviteCode: CODE, groupName: 'Crypto Kings' } } },
    } as any)
    expect(hit?.inviteCode).toBe(CODE)
  })

  it('returns null when there is no invite card', () => {
    expect(extractNativeInvite({})).toBeNull()
    expect(extractNativeInvite(undefined)).toBeNull()
  })
})

describe('resolveForeignLinks', () => {
  const OWN = new Set(['OwnCode1234567890AbCdE'])
  const NETWORK = new Set(['1111@g.us'])

  beforeEach(() => clearInviteCache())

  const invite = (code: string) => findWhatsappLinks(`https://chat.whatsapp.com/${code}`)

  it("drops the network's own configured invite links without resolving", async () => {
    const lookup = jest.fn()
    const out = await resolveForeignLinks(invite('OwnCode1234567890AbCdE'), lookup, OWN, NETWORK)
    expect(out).toHaveLength(0)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('drops invites that resolve to a group inside the network', async () => {
    const lookup = jest.fn().mockResolvedValue({ id: '1111@g.us', subject: 'Litter Pickers' })
    const out = await resolveForeignLinks(invite('ForeignCode1234567890A'), lookup, OWN, NETWORK)
    expect(out).toHaveLength(0)
  })

  it('keeps foreign invites and labels them with the resolved group name', async () => {
    const lookup = jest.fn().mockResolvedValue({ id: '9999@g.us', subject: 'Crypto Kings' })
    const out = await resolveForeignLinks(invite('ForeignCode1234567890A'), lookup, OWN, NETWORK)
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('whatsapp-invite-link ("Crypto Kings")')
    expect(out[0].groupName).toBe('Crypto Kings')
  })

  it('keeps invites whose code no longer resolves', async () => {
    const lookup = jest.fn().mockRejectedValue(new Error('gone'))
    const out = await resolveForeignLinks(invite('DeadCode12345678901234'), lookup, OWN, NETWORK)
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('whatsapp-invite-link (unresolved)')
  })

  it('does not allowlist a native card by its self-declared group when it carries a foreign code', async () => {
    const card = extractNativeInvite({
      groupInviteMessage: { inviteCode: 'SpoofCode1234567890AbC', groupJid: '1111@g.us', groupName: 'Litter Pickers' },
    })!
    const lookup = jest.fn().mockResolvedValue({ id: '9999@g.us', subject: 'Crypto Kings' })
    const out = await resolveForeignLinks([card], lookup, OWN, NETWORK)
    expect(out).toHaveLength(1)
    expect(out[0].label).toContain('Crypto Kings')
  })

  it('drops an inert native card (no code) that points at a network group', async () => {
    const card = extractNativeInvite({
      groupInviteMessage: { groupJid: '1111@g.us', groupName: 'Litter Pickers' },
    })!
    const out = await resolveForeignLinks([card], jest.fn(), OWN, NETWORK)
    expect(out).toHaveLength(0)
  })

  it('passes non-invite links straight through without lookups', async () => {
    const lookup = jest.fn()
    const hits = findWhatsappLinks('https://wa.link/earnbig and wa.me/4915123456789')
    const out = await resolveForeignLinks(hits, lookup, OWN, NETWORK)
    expect(out).toHaveLength(2)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('caches invite resolutions across calls', async () => {
    const lookup = jest.fn().mockResolvedValue({ id: '9999@g.us', subject: 'Crypto Kings' })
    await resolveForeignLinks(invite('CachedCode123456789012'), lookup, OWN, NETWORK)
    await resolveForeignLinks(invite('CachedCode123456789012'), lookup, OWN, NETWORK)
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})

describe('extractText (wrapped + invite messages)', () => {
  const msg = (message: WAMessage['message']) => ({ key: {}, message } as WAMessage)

  it('unwraps ephemeral (disappearing-message) wrappers', () => {
    expect(extractText(msg({ ephemeralMessage: { message: { conversation: 'hello' } } } as any))).toBe('hello')
  })

  it('extracts the caption of a native invite card', () => {
    expect(extractText(msg({ groupInviteMessage: { caption: 'come join quick' } } as any))).toBe('come join quick')
  })
})
