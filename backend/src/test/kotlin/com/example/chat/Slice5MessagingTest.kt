package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice5MessagingTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 5: implement — STOMP chat.send (/app/chat.send) delivers MessageEvent to /topic/room.{id} subscribers; GET /api/messages/{roomId} returns cursor-paginated history (?before=&limit=50); message edit (PATCH /api/messages/{id}); message delete (DELETE /api/messages/{id}, soft-delete); reply threads (parentMessageId field). Only room members may send or read.")
    fun `room STOMP messaging and message history`() {
    }
}
