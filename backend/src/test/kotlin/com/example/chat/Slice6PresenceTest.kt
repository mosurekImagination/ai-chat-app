package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice6PresenceTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 6: implement — /app/presence.activity (heartbeat, called every 30s); /app/presence.afk (tab idle); @Scheduled AFK scan marks users AFK after 60s of no activity; SessionDisconnectEvent sets OFFLINE; PresenceEvent pushed to friends' /user/queue/presence on status change; GET /api/presence/friends returns friend list with current status.")
    fun `presence heartbeat AFK and OFFLINE lifecycle`() {
    }
}
