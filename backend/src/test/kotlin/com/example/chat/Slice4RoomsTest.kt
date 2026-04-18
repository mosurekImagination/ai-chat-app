package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice4RoomsTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 4: implement — room create (POST /api/rooms), list (GET /api/rooms), join (POST /api/rooms/{id}/join), leave (DELETE /api/rooms/{id}/leave), member list (GET /api/rooms/{id}/members), room update (PATCH /api/rooms/{id}), room delete (DELETE /api/rooms/{id}). JWT filter must reject 401 on all endpoints without a valid cookie.")
    fun `room CRUD and membership`() {
    }
}
