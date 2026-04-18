package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice10UnreadTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 10: implement — POST /api/rooms/{id}/read upserts room_read_cursors (INSERT ... ON CONFLICT DO UPDATE with MAX(id) subquery — never read-then-write); GET /api/rooms/{id}/unread returns {unreadCount: N}; mention (@username in message content) triggers NotificationEvent pushed to /user/queue/notifications; DM message arrival also pushes NotificationEvent; GET /api/notifications returns recent notifications; POST /api/notifications/{id}/read marks read.")
    fun `unread counts and notification push`() {
    }
}
