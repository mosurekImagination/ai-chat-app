-- ============================================================
-- V001__initial_schema.sql
-- Full schema for chat-server. Never edit this file after first
-- docker compose up — Flyway detects checksum mismatches.
-- New schema changes must go in V002__, V003__, etc.
-- ============================================================

CREATE TABLE users (
    id           BIGSERIAL PRIMARY KEY,
    email        TEXT      NOT NULL UNIQUE,
    username     TEXT      NOT NULL UNIQUE,
    password_hash TEXT     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
);

CREATE TABLE sessions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT      NOT NULL,
    browser_info TEXT,
    ip           TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE password_reset_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE friendships (
    id           BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT   NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED')),
    message      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (requester_id, addressee_id)
);

CREATE TABLE user_bans (
    id         BIGSERIAL PRIMARY KEY,
    banner_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (banner_id, banned_id)
);

CREATE TABLE rooms (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    visibility  TEXT NOT NULL CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'DM')),
    owner_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE room_members (
    id        BIGSERIAL PRIMARY KEY,
    room_id   BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT   NOT NULL CHECK (role IN ('MEMBER', 'ADMIN')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE TABLE room_bans (
    id           BIGSERIAL PRIMARY KEY,
    room_id      BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE TABLE messages (
    id                BIGSERIAL PRIMARY KEY,
    room_id           BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id         BIGINT REFERENCES users(id) ON DELETE SET NULL, -- NULL = "Deleted User"
    content           TEXT   NOT NULL,
    parent_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at         TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ
);

CREATE TABLE attachments (
    id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        BIGINT  NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    storage_path      TEXT    NOT NULL, -- {roomId}/{uuid} — no original filename
    original_filename TEXT    NOT NULL,
    mime_type         TEXT    NOT NULL,
    size_bytes        BIGINT  NOT NULL,
    comment           TEXT
);

CREATE TABLE room_read_cursors (
    room_id             BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_message_id BIGINT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Core message history query: WHERE room_id = ? AND id < ? AND deleted_at IS NULL
-- ORDER BY created_at DESC, id DESC
CREATE INDEX idx_messages_room_history
    ON messages(room_id, id DESC)
    WHERE deleted_at IS NULL;

-- Unread count query: id > last_read_message_id
CREATE INDEX idx_messages_room_unread
    ON messages(room_id, id)
    WHERE deleted_at IS NULL;

-- Friend lookups
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);

-- Session token validation (hot path on every authenticated request)
-- Note: partial index WHERE expires_at > NOW() is invalid in PostgreSQL (NOW() is STABLE not IMMUTABLE)
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);

-- Room name uniqueness: case-insensitive (so "Chat" and "chat" are the same room)
CREATE UNIQUE INDEX idx_rooms_name_lower ON rooms (LOWER(name));
