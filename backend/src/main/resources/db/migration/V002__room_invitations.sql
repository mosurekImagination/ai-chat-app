CREATE TABLE room_invitations (
    id         BIGSERIAL PRIMARY KEY,
    room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, user_id)
);

CREATE INDEX idx_room_invitations_user ON room_invitations(user_id);
