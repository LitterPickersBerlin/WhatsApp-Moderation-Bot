export interface Subscription {
  userJid:    string   // hashed — for identity/dedup only
  contactJid: string   // raw JID — for sock.sendMessage
  groupJid:   string
  keywords:   string[]
}

export interface MemberRecord {
  score:    number
  messages: number
}
