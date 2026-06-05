-- keyword_subscriptions
CREATE TABLE IF NOT EXISTS keyword_subscriptions (
  id            SERIAL      PRIMARY KEY,
  user_jid      TEXT        NOT NULL,
  group_jid     TEXT        NOT NULL,
  keywords      TEXT[]      NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  contact_jid   TEXT,
  trigger_count INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (user_jid, group_jid, keywords)
);

-- member_scores
CREATE TABLE IF NOT EXISTS member_scores (
  group_jid  TEXT        NOT NULL,
  user_jid   TEXT        NOT NULL,
  score      INTEGER     NOT NULL DEFAULT 0,
  messages   INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_jid, user_jid)
);

-- users
CREATE TABLE IF NOT EXISTS users (
  user_jid       TEXT PRIMARY KEY,
  phone          TEXT,
  display_name   TEXT,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  message_count  INTEGER     NOT NULL DEFAULT 0,
  reaction_count INTEGER     NOT NULL DEFAULT 0,
  admin_override TEXT        CHECK (admin_override IN ('keep', 'flag')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_last_active    ON users (last_active_at);
CREATE INDEX IF NOT EXISTS idx_users_admin_override ON users (admin_override);

-- group_members
CREATE TABLE IF NOT EXISTS group_members (
  group_jid  TEXT        NOT NULL,
  user_jid   TEXT        NOT NULL REFERENCES users (user_jid) ON DELETE CASCADE,
  is_admin   BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at  TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_jid, user_jid)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members (group_jid);
CREATE INDEX IF NOT EXISTS idx_group_members_user  ON group_members (user_jid);

-- group_membership_events
CREATE TABLE IF NOT EXISTS group_membership_events (
  id          SERIAL      PRIMARY KEY,
  group_jid   TEXT        NOT NULL,
  user_jid    TEXT        NOT NULL,
  event       TEXT        NOT NULL CHECK (event IN ('join', 'leave', 'remove', 'promote', 'demote')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_events_group ON group_membership_events (group_jid, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_events_user  ON group_membership_events (user_jid, occurred_at DESC);

-- reactions
CREATE TABLE IF NOT EXISTS reactions (
  id          SERIAL      PRIMARY KEY,
  group_jid   TEXT        NOT NULL,
  sender_jid  TEXT        NOT NULL,
  message_id  TEXT        NOT NULL,
  emoji       TEXT        NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sender_jid, message_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_sender ON reactions (sender_jid);
CREATE INDEX IF NOT EXISTS idx_reactions_group  ON reactions (group_jid, occurred_at DESC);

-- groups
CREATE TABLE IF NOT EXISTS groups (
  group_jid  TEXT PRIMARY KEY,
  name       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
