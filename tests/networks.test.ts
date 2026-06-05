import { getAllObserved, getNetworkPeers } from '../src/utils/networks'

const networks = {
  GROUP_A: ['aaa@g.us', 'bbb@g.us', 'ccc@g.us'],
  GROUP_B: ['ddd@g.us', 'eee@g.us'],
}

describe('getAllObserved', () => {
  it('returns all JIDs across all networks', () => {
    const observed = getAllObserved(networks)
    expect(observed).toEqual(new Set(['aaa@g.us', 'bbb@g.us', 'ccc@g.us', 'ddd@g.us', 'eee@g.us']))
  })

  it('returns empty set for empty networks', () => {
    expect(getAllObserved({})).toEqual(new Set())
  })
})

describe('getNetworkPeers', () => {
  it('returns the other JIDs in the same network', () => {
    expect(getNetworkPeers('aaa@g.us', networks)).toEqual(['bbb@g.us', 'ccc@g.us'])
  })

  it('excludes the queried JID from results', () => {
    const peers = getNetworkPeers('bbb@g.us', networks)
    expect(peers).not.toContain('bbb@g.us')
  })

  it('does not include JIDs from other networks', () => {
    const peers = getNetworkPeers('aaa@g.us', networks)
    expect(peers).not.toContain('ddd@g.us')
    expect(peers).not.toContain('eee@g.us')
  })

  it('returns empty array for a JID not in any network', () => {
    expect(getNetworkPeers('zzz@g.us', networks)).toEqual([])
  })

  it('returns empty array for a solo group with one member', () => {
    expect(getNetworkPeers('ddd@g.us', { SOLO: ['ddd@g.us'] })).toEqual([])
  })
})
