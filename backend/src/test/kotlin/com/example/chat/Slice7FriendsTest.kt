package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice7FriendsTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 7: implement — send friend request (POST /api/friends/requests); list incoming (GET /api/friends/requests); accept/reject (PATCH /api/friends/requests/{id} with {action: ACCEPT|REJECT}); ACCEPT creates DM room server-side and returns dmRoomId in response; list friends (GET /api/friends); remove friend (DELETE /api/friends/{userId}); user ban (POST /api/users/{id}/ban) blocks friend requests; DM ban (POST /api/rooms/{id}/ban) sets room to read-only for banned user.")
    fun `friends DM creation and user bans`() {
    }
}
