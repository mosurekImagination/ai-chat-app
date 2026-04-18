package com.example.chat

import com.example.chat.domain.friend.FriendshipRepository
import com.example.chat.domain.friend.UserBanRepository
import com.example.chat.domain.room.RoomBanRepository
import com.example.chat.domain.room.RoomMemberRepository
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
import org.springframework.messaging.simp.stomp.StompFrameHandler
import org.springframework.messaging.simp.stomp.StompHeaders
import org.springframework.messaging.simp.stomp.StompSession
import java.lang.reflect.Type
import java.util.concurrent.atomic.AtomicReference

class Slice7FriendsTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var friendshipRepository: FriendshipRepository
    @Autowired lateinit var userBanRepository: UserBanRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var roomBanRepository: RoomBanRepository

    @AfterEach
    fun cleanup() {
        roomBanRepository.deleteAll()
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
        userBanRepository.deleteAll()
        friendshipRepository.deleteAll()
        userRepository.deleteAll()
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun register(email: String, username: String): Pair<String, Long> {
        val body = mapOf("email" to email, "username" to username, "password" to "s3cr3tP@ss")
        val resp = restTemplate.postForEntity("/api/auth/register", body, Map::class.java)
        val cookie = extractAuthCookie(resp)
        @Suppress("UNCHECKED_CAST")
        val userId = (resp.body!!["userId"] as Number).toLong()
        return cookie to userId
    }

    private fun headers(cookie: String) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        add("Cookie", "access_token=$cookie")
    }

    private fun post(cookie: String, url: String, body: Any?): org.springframework.http.ResponseEntity<Map<*, *>> =
        restTemplate.exchange(url, HttpMethod.POST, HttpEntity(body, headers(cookie)), Map::class.java)

    private fun patch(cookie: String, url: String, body: Any?): org.springframework.http.ResponseEntity<Map<*, *>> =
        restTemplate.exchange(url, HttpMethod.PATCH, HttpEntity(body, headers(cookie)), Map::class.java)

    private fun delete(cookie: String, url: String): org.springframework.http.ResponseEntity<Void> =
        restTemplate.exchange(url, HttpMethod.DELETE, HttpEntity<Void>(headers(cookie)), Void::class.java)

    private fun subscribeNotifications(session: StompSession): AtomicReference<Map<*, *>> {
        val ref = AtomicReference<Map<*, *>>()
        session.subscribe("/user/queue/notifications", object : StompFrameHandler {
            override fun getPayloadType(headers: StompHeaders): Type = Map::class.java
            override fun handleFrame(headers: StompHeaders, payload: Any?) {
                @Suppress("UNCHECKED_CAST")
                ref.compareAndSet(null, payload as? Map<*, *>)
            }
        })
        return ref
    }

    private fun awaitEvent(ref: AtomicReference<Map<*, *>>, timeoutMs: Long = 3000): Map<*, *> {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            ref.get()?.let { return it }
            Thread.sleep(50)
        }
        error("Timed out waiting for notification event")
    }

    // ---------------------------------------------------------------------------
    // Send friend request
    // ---------------------------------------------------------------------------

    @Test
    fun `send friend request returns 201 with PENDING status`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (_, _) = register("bob@example.com", "bob")

        val resp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))

        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        assertThat(resp.body!!["status"]).isEqualTo("PENDING")
        assertThat((resp.body!!["requester"] as Map<*, *>)["username"]).isEqualTo("alice")
        assertThat((resp.body!!["addressee"] as Map<*, *>)["username"]).isEqualTo("bob")
    }

    @Test
    fun `send friend request notifies addressee via STOMP`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")

        val bobSession = connectStomp(bobCookie)
        val ref = subscribeNotifications(bobSession)
        Thread.sleep(200)

        post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val event = awaitEvent(ref)

        assertThat(event["type"]).isEqualTo("FRIEND_REQUEST")
        @Suppress("UNCHECKED_CAST")
        val payload = event["payload"] as Map<*, *>
        assertThat(payload["fromUsername"]).isEqualTo("alice")

        bobSession.disconnect()
    }

    @Test
    fun `duplicate friend request returns 409 FRIEND_REQUEST_EXISTS`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        register("bob@example.com", "bob")

        post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val resp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))

        assertThat(resp.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(resp.body!!["error"]).isEqualTo("FRIEND_REQUEST_EXISTS")
    }

    // ---------------------------------------------------------------------------
    // List friend requests
    // ---------------------------------------------------------------------------

    @Test
    fun `list friend requests returns pending requests`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")

        post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))

        val resp = restTemplate.exchange(
            "/api/friends/requests", HttpMethod.GET,
            HttpEntity<Void>(headers(bobCookie)), List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        @Suppress("UNCHECKED_CAST")
        val requests = resp.body!! as List<Map<*, *>>
        assertThat(requests).hasSize(1)
        assertThat(requests[0]["status"]).isEqualTo("PENDING")
    }

    // ---------------------------------------------------------------------------
    // Accept friend request
    // ---------------------------------------------------------------------------

    @Test
    fun `accept friend request creates DM room and returns dmRoomId`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")

        val requestResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val requestId = (requestResp.body!!["id"] as Number).toLong()

        val acceptResp = patch(bobCookie, "/api/friends/requests/$requestId", mapOf("action" to "ACCEPT"))

        assertThat(acceptResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(acceptResp.body!!["status"]).isEqualTo("ACCEPTED")
        val dmRoomId = (acceptResp.body!!["dmRoomId"] as Number).toLong()
        assertThat(dmRoomId).isPositive()

        // DM room should exist and have both members
        val dmRoom = roomRepository.findById(dmRoomId).orElseThrow()
        assertThat(dmRoom.visibility).isEqualTo("DM")
        assertThat(roomMemberRepository.existsByRoomIdAndUserId(dmRoomId, aliceId)).isTrue()
    }

    @Test
    fun `accept friend request sends FRIEND_ACCEPTED notification to requester`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")

        val aliceSession = connectStomp(aliceCookie)
        val ref = subscribeNotifications(aliceSession)
        Thread.sleep(200)

        val requestResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val requestId = (requestResp.body!!["id"] as Number).toLong()
        patch(bobCookie, "/api/friends/requests/$requestId", mapOf("action" to "ACCEPT"))

        val event = awaitEvent(ref)
        assertThat(event["type"]).isEqualTo("FRIEND_ACCEPTED")
        @Suppress("UNCHECKED_CAST")
        val payload = event["payload"] as Map<*, *>
        assertThat(payload["friendUsername"]).isEqualTo("bob")

        aliceSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // Reject friend request
    // ---------------------------------------------------------------------------

    @Test
    fun `reject friend request deletes friendship row`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")

        val requestResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val requestId = (requestResp.body!!["id"] as Number).toLong()

        val rejectResp = patch(bobCookie, "/api/friends/requests/$requestId", mapOf("action" to "REJECT"))
        assertThat(rejectResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(friendshipRepository.findAll()).isEmpty()
    }

    // ---------------------------------------------------------------------------
    // Remove friend
    // ---------------------------------------------------------------------------

    @Test
    fun `remove friend deletes accepted friendship`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")

        val requestResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val requestId = (requestResp.body!!["id"] as Number).toLong()
        patch(bobCookie, "/api/friends/requests/$requestId", mapOf("action" to "ACCEPT"))

        val deleteResp = delete(aliceCookie, "/api/friends/$bobId")
        assertThat(deleteResp.statusCode).isEqualTo(HttpStatus.NO_CONTENT)
        assertThat(friendshipRepository.findAll()).isEmpty()
    }

    // ---------------------------------------------------------------------------
    // User ban
    // ---------------------------------------------------------------------------

    @Test
    fun `user ban blocks friend request from banned user`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")

        // Alice bans Bob
        val banResp = post(aliceCookie, "/api/users/$bobId/ban", null)
        assertThat(banResp.statusCode).isEqualTo(HttpStatus.CREATED)

        // Bob tries to send friend request to Alice
        val reqResp = post(bobCookie, "/api/friends/requests", mapOf("username" to "alice"))
        assertThat(reqResp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }

    @Test
    fun `user ban terminates existing friendship`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")

        val requestResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val requestId = (requestResp.body!!["id"] as Number).toLong()
        patch(bobCookie, "/api/friends/requests/$requestId", mapOf("action" to "ACCEPT"))

        post(aliceCookie, "/api/users/$bobId/ban", null)

        assertThat(friendshipRepository.findAll()).isEmpty()
    }

    @Test
    fun `user ban sends DM_BANNED notification and bans from DM room`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")

        // Become friends (creates DM room)
        val requestResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        val requestId = (requestResp.body!!["id"] as Number).toLong()
        val acceptResp = patch(bobCookie, "/api/friends/requests/$requestId", mapOf("action" to "ACCEPT"))
        val dmRoomId = (acceptResp.body!!["dmRoomId"] as Number).toLong()

        // Bob subscribes to notifications
        val bobSession = connectStomp(bobCookie)
        val ref = subscribeNotifications(bobSession)
        Thread.sleep(200)

        // Alice bans Bob
        post(aliceCookie, "/api/users/$bobId/ban", null)

        val event = awaitEvent(ref)
        assertThat(event["type"]).isEqualTo("DM_BANNED")

        // Bob is now room-banned from the DM room
        assertThat(roomBanRepository.existsByRoomIdAndUserId(dmRoomId, bobId)).isTrue()

        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // Room ban (admin bans user from regular room)
    // ---------------------------------------------------------------------------

    @Test
    fun `room admin can ban a user and sends ROOM_BANNED notification`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")

        // Alice creates a room (becomes admin)
        val createResp = post(aliceCookie, "/api/rooms", mapOf("name" to "TestRoom", "visibility" to "PUBLIC"))
        val roomId = (createResp.body!!["id"] as Number).toLong()

        // Bob joins
        post(bobCookie, "/api/rooms/$roomId/join", null)

        // Bob subscribes to notifications
        val bobSession = connectStomp(bobCookie)
        val ref = subscribeNotifications(bobSession)
        Thread.sleep(200)

        // Alice bans Bob
        val banResp = post(aliceCookie, "/api/rooms/$roomId/bans", mapOf("userId" to bobId))
        assertThat(banResp.statusCode).isEqualTo(HttpStatus.CREATED)

        val event = awaitEvent(ref)
        assertThat(event["type"]).isEqualTo("ROOM_BANNED")

        // Bob is room-banned
        assertThat(roomBanRepository.existsByRoomIdAndUserId(roomId, bobId)).isTrue()

        bobSession.disconnect()
    }
}
