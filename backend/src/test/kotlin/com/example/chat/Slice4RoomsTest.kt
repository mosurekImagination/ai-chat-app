package com.example.chat

import com.example.chat.domain.room.RoomRepository
import com.example.chat.domain.user.UserRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType

class Slice4RoomsTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository

    @AfterEach
    fun cleanup() {
        roomRepository.deleteAll()
        userRepository.deleteAll()
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun register(email: String, username: String): String {
        val body = mapOf("email" to email, "username" to username, "password" to "s3cr3tP@ss")
        val resp = restTemplate.postForEntity("/api/auth/register", body, Map::class.java)
        return extractAuthCookie(resp)
    }

    private fun headers(cookie: String) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        add("Cookie", "access_token=$cookie")
    }

    private fun createRoom(cookie: String, name: String = "general", visibility: String = "PUBLIC"): Map<*, *> {
        val body = mapOf("name" to name, "visibility" to visibility)
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(body, headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        return resp.body!!
    }

    // ---------------------------------------------------------------------------
    // Create room
    // ---------------------------------------------------------------------------

    @Test
    fun `create room returns 201 with room details`() {
        val cookie = register("alice@example.com", "alice")
        val body = mapOf("name" to "general", "description" to "chat here", "visibility" to "PUBLIC")
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(body, headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        val room = resp.body!!
        assertThat(room["name"]).isEqualTo("general")
        assertThat(room["visibility"]).isEqualTo("PUBLIC")
        assertThat(room["memberCount"]).isEqualTo(1)
        assertThat(room["id"]).isNotNull()
    }

    @Test
    fun `create room without auth returns 401`() {
        val resp = restTemplate.postForEntity("/api/rooms", mapOf("name" to "x", "visibility" to "PUBLIC"), Map::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `create room with duplicate name returns 409 DUPLICATE_ROOM_NAME`() {
        val cookie = register("alice@example.com", "alice")
        createRoom(cookie, "general")
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "general", "visibility" to "PUBLIC"), headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(resp.body!!["error"]).isEqualTo("DUPLICATE_ROOM_NAME")
    }

    @Test
    fun `create room with DM visibility returns 400`() {
        val cookie = register("alice@example.com", "alice")
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "dm-room", "visibility" to "DM"), headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
    }

    // ---------------------------------------------------------------------------
    // List rooms
    // ---------------------------------------------------------------------------

    @Test
    fun `list public rooms returns created room`() {
        val cookie = register("alice@example.com", "alice")
        createRoom(cookie, "general")
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(resp.body!!).isNotEmpty()
    }

    @Test
    fun `list rooms with search query filters by name`() {
        val cookie = register("alice@example.com", "alice")
        createRoom(cookie, "general")
        createRoom(cookie, "random")
        val resp = restTemplate.exchange(
            "/api/rooms?q=gen", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        @Suppress("UNCHECKED_CAST")
        val rooms = resp.body!! as List<Map<String, Any>>
        assertThat(rooms).hasSize(1)
        assertThat(rooms[0]["name"]).isEqualTo("general")
    }

    // ---------------------------------------------------------------------------
    // Get room by id
    // ---------------------------------------------------------------------------

    @Test
    fun `get room by id returns 200`() {
        val cookie = register("alice@example.com", "alice")
        val created = createRoom(cookie)
        val id = created["id"]
        val resp = restTemplate.exchange(
            "/api/rooms/$id", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(resp.body!!["name"]).isEqualTo("general")
    }

    @Test
    fun `get room by id not found returns 404`() {
        val cookie = register("alice@example.com", "alice")
        val resp = restTemplate.exchange(
            "/api/rooms/999999", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }

    // ---------------------------------------------------------------------------
    // Join / leave
    // ---------------------------------------------------------------------------

    @Test
    fun `join public room returns 201 and user appears in members`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        val id = room["id"]

        val joinResp = restTemplate.exchange(
            "/api/rooms/$id/join", HttpMethod.POST,
            HttpEntity<Void>(headers(bobCookie)), Map::class.java
        )
        assertThat(joinResp.statusCode).isEqualTo(HttpStatus.CREATED)

        val membersResp = restTemplate.exchange(
            "/api/rooms/$id/members", HttpMethod.GET,
            HttpEntity<Void>(headers(aliceCookie)), List::class.java
        )
        @Suppress("UNCHECKED_CAST")
        val members = membersResp.body!! as List<Map<String, Any>>
        assertThat(members.map { it["username"] }).contains("bob")
    }

    @Test
    fun `join room already member returns 409 ALREADY_MEMBER`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val resp = restTemplate.exchange(
            "/api/rooms/${room["id"]}/join", HttpMethod.POST,
            HttpEntity<Void>(headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(resp.body!!["error"]).isEqualTo("ALREADY_MEMBER")
    }

    @Test
    fun `leave room returns 204`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        restTemplate.exchange("/api/rooms/${room["id"]}/join", HttpMethod.POST, HttpEntity<Void>(headers(bobCookie)), Void::class.java)

        val leaveResp = restTemplate.exchange(
            "/api/rooms/${room["id"]}/leave", HttpMethod.DELETE,
            HttpEntity<Void>(headers(bobCookie)), Void::class.java
        )
        assertThat(leaveResp.statusCode).isEqualTo(HttpStatus.NO_CONTENT)
    }

    @Test
    fun `owner cannot leave room returns 403 OWNER_CANNOT_LEAVE`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val resp = restTemplate.exchange(
            "/api/rooms/${room["id"]}/leave", HttpMethod.DELETE,
            HttpEntity<Void>(headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(resp.body!!["error"]).isEqualTo("OWNER_CANNOT_LEAVE")
    }

    // ---------------------------------------------------------------------------
    // Members list
    // ---------------------------------------------------------------------------

    @Test
    fun `list members without membership returns 403 NOT_MEMBER`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        val resp = restTemplate.exchange(
            "/api/rooms/${room["id"]}/members", HttpMethod.GET,
            HttpEntity<Void>(headers(bobCookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(resp.body!!["error"]).isEqualTo("NOT_MEMBER")
    }

    // ---------------------------------------------------------------------------
    // Update room
    // ---------------------------------------------------------------------------

    @Test
    fun `update room name returns 200`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val resp = restTemplate.exchange(
            "/api/rooms/${room["id"]}", HttpMethod.PATCH,
            HttpEntity(mapOf("name" to "updated-name"), headers(cookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(resp.body!!["name"]).isEqualTo("updated-name")
    }

    @Test
    fun `update room by non-owner returns 403`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        restTemplate.exchange("/api/rooms/${room["id"]}/join", HttpMethod.POST, HttpEntity<Void>(headers(bobCookie)), Void::class.java)

        val resp = restTemplate.exchange(
            "/api/rooms/${room["id"]}", HttpMethod.PATCH,
            HttpEntity(mapOf("name" to "hijacked"), headers(bobCookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }

    // ---------------------------------------------------------------------------
    // Delete room
    // ---------------------------------------------------------------------------

    @Test
    fun `delete room returns 204 and room is gone`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val deleteResp = restTemplate.exchange(
            "/api/rooms/${room["id"]}", HttpMethod.DELETE,
            HttpEntity<Void>(headers(cookie)), Void::class.java
        )
        assertThat(deleteResp.statusCode).isEqualTo(HttpStatus.NO_CONTENT)

        val getResp = restTemplate.exchange(
            "/api/rooms/${room["id"]}", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), Map::class.java
        )
        assertThat(getResp.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }

    @Test
    fun `delete room by non-owner returns 403`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        restTemplate.exchange("/api/rooms/${room["id"]}/join", HttpMethod.POST, HttpEntity<Void>(headers(bobCookie)), Void::class.java)

        val resp = restTemplate.exchange(
            "/api/rooms/${room["id"]}", HttpMethod.DELETE,
            HttpEntity<Void>(headers(bobCookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }
}
