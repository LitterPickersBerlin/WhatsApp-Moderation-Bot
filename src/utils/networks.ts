import { GROUP_NETWORKS } from '../config'

export function getAllObserved(networks: Record<string, string[]> = GROUP_NETWORKS): Set<string> {
  return new Set(Object.values(networks).flat())
}

export function getNetworkPeers(jid: string, networks: Record<string, string[]> = GROUP_NETWORKS): string[] {
  const network = Object.values(networks).find(g => g.includes(jid))
  return network ? network.filter(g => g !== jid) : []
}
