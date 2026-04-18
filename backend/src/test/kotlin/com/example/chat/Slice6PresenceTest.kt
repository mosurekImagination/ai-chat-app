package com.example.chat

import com.example.chat.domain.friend.Friendship
import com.example.chat.domain.friend.FriendshipRepository
import com.example.chat.domain.presence.PresenceService
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

class Slice6PresenceTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var friendshipRepository: FriendshipRepository
    @Autowired lateinit var presenceService: PresenceService

    @AfterEach
    fun cleanup() {
        presenceService.presenceMap.clear()
        presenceService.sessionToUser.clear()
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

    private fun makeFriends(userId1: Long, userId2: Long) {
        friendshipRepository.save(Friendship(requesterId = userId1, addresseeId = userId2, status = "ACCEPTED"))
    }

    private fun headers(cookie: String) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        add("Cookie", "access_token=$cookie")
    }

    private fun subscribePresence(session: StompSession): AtomicReference<Map<*, *>> {
        val ref = AtomicReference<Map<*, *>>()
        session.subscribe("/user/queue/presence", object : StompFrameHandler {
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
        error("Timed out waiting for PresenceEvent")
    }

    private fun sendStomp(session: StompSession, destination: String, payload: Map<String, Any?> = emptyMap()) {
        val h = StompHeaders().apply { this.destination = destination }
        session.send(h, payload as Any)
    }

    // ---------------------------------------------------------------------------
    // ONLINE on connect, OFFLINE on disconnect
    // ---------------------------------------------------------------------------

    @Test
    fun `STOMP connect pushes ONLINE to friends`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        val ref = subscribePresence(bobSession)
        Thread.sleep(200)

        val aliceSession = connectStomp(aliceCookie)
        val event = awaitEvent(ref)

        assertThat(event["userId"]).isEqualTo(aliceId.toInt())
        assertThat(event["status"]).isEqualTo("ONLINE")

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    @Test
    fun `STOMP disconnect pushes OFFLINE to friends`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        val aliceSession = connectStomp(aliceCookie)
        val ref = subscribePresence(bobSession)
        Thread.sleep(300)

        ref.set(null) // clear the ONLINE event from alice's connect
        aliceSession.disconnect()
        val event = awaitEvent(ref)

        assertThat(event["userId"]).isEqualTo(aliceId.toInt())
        assertThat(event["status"]).isEqualTo("OFFLINE")

        bobSession.disconnect()
    }

    @Test
    fun `non-friend does not receive presence event`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        // no friendship created

        val bobSession = connectStomp(bobCookie)
        val ref = subscribePresence(bobSession)
        Thread.sleep(200)

        val aliceSession = connectStomp(aliceCookie)
        Thread.sleep(600)

        assertThat(ref.get()).isNull()

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // Multi-tab: two sessions, close one → still ONLINE
    // ---------------------------------------------------------------------------

    @Test
    fun `closing one of two sessions keeps user ONLINE`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        val alice1 = connectStomp(aliceCookie)
        val alice2 = connectStomp(aliceCookie)
        val ref = subscribePresence(bobSession)
        Thread.sleep(300)

        ref.set(null)
        alice1.disconnect()
        Thread.sleep(600)

        // Alice still has one session — no OFFLINE should be pushed
        assertThat(ref.get()).isNull()
        assertThat(presenceService.getStatus(aliceId)).isEqualTo("ONLINE")

        alice2.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // AFK via explicit presence.afk frame
    // ---------------------------------------------------------------------------

    @Test
    fun `presence afk pushes AFK to friends`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        val aliceSession = connectStomp(aliceCookie)
        val ref = subscribePresence(bobSession)
        Thread.sleep(300)

        ref.set(null)
        sendStomp(aliceSession, "/app/presence.afk")
        val event = awaitEvent(ref)

        assertThat(event["userId"]).isEqualTo(aliceId.toInt())
        assertThat(event["status"]).isEqualTo("AFK")

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // Recovery: presence.activity after AFK → ONLINE
    // ---------------------------------------------------------------------------

    @Test
    fun `presence activity after AFK pushes ONLINE to friends`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        val aliceSession = connectStomp(aliceCookie)
        val ref = subscribePresence(bobSession)
        Thread.sleep(300)

        // Go AFK
        ref.set(null)
        sendStomp(aliceSession, "/app/presence.afk")
        awaitEvent(ref) // wait for AFK event

        // Recover with activity
        ref.set(null)
        sendStomp(aliceSession, "/app/presence.activity")
        val event = awaitEvent(ref)

        assertThat(event["status"]).isEqualTo("ONLINE")

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // AFK scheduler: no heartbeat for >afkTimeoutSeconds → AFK
    // (afkTimeoutSeconds=2 in test profile, scheduler runs every 10s)
    // ---------------------------------------------------------------------------

    @Test
    fun `AFK scanner marks idle user as AFK`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        val aliceSession = connectStomp(aliceCookie)
        Thread.sleep(300)

        // Wait for AFK timeout to expire (afkTimeoutSeconds=2 in test profile)
        Thread.sleep(2500)

        // Manually trigger the AFK scan (avoids waiting up to 10s for scheduler)
        val ref = subscribePresence(bobSession)
        Thread.sleep(100)
        presenceService.runAfkScan()

        val event = awaitEvent(ref)
        assertThat(event["userId"]).isEqualTo(aliceId.toInt())
        assertThat(event["status"]).isEqualTo("AFK")

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // GET /api/friends returns friends with presence
    // ---------------------------------------------------------------------------

    @Test
    fun `GET api friends returns friend list with presence`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val bobSession = connectStomp(bobCookie)
        Thread.sleep(200)

        val resp = restTemplate.exchange(
            "/api/friends", HttpMethod.GET,
            HttpEntity<Void>(headers(aliceCookie)), List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        @Suppress("UNCHECKED_CAST")
        val friends = resp.body!! as List<Map<*, *>>
        assertThat(friends).hasSize(1)
        assertThat(friends[0]["username"]).isEqualTo("bob")
        assertThat(friends[0]["presence"]).isEqualTo("ONLINE")

        bobSession.disconnect()
    }

    @Test
    fun `GET api friends returns OFFLINE when friend not connected`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (_, bobId) = register("bob@example.com", "bob")
        makeFriends(aliceId, bobId)

        val resp = restTemplate.exchange(
            "/api/friends", HttpMethod.GET,
            HttpEntity<Void>(headers(aliceCookie)), List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        @Suppress("UNCHECKED_CAST")
        val friends = resp.body!! as List<Map<*, *>>
        assertThat(friends[0]["presence"]).isEqualTo("OFFLINE")
    }
}
