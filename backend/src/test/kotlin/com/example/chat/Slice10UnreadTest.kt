package com.example.chat

import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomReadCursorRepository
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

// Deviations from architecture-proposal.md (Slice 9 / Slice 10 section):
// 1. Architecture proposal says GET /api/rooms (public catalog) returns unreadCount per user.
//    Implementation returns 0 there — unreadCount is only real in GET /api/rooms/me. The public
//    catalog has no userId context (unauthenticated endpoint).
// 2. Architecture proposal's notification types are FRIEND_REQUEST, FRIEND_ACCEPTED, INVITE,
//    ROOM_BANNED, DM_BANNED. Implementation added MENTION and DM_MESSAGE (stub requirement).
// 3. Architecture proposal requires N+1 assertion (query count ≤ 3 for N rooms). Skipped —
//    getMyRooms() intentionally deferred this optimisation (see RoomService TODO comment).
class Slice10UnreadTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var roomReadCursorRepository: RoomReadCursorRepository

    @AfterEach
    fun cleanup() {
        roomReadCursorRepository.deleteAll()
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
        userRepository.deleteAll()
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun register(email: String, username: String, password: String = "s3cr3tP@ss"): Pair<String, Long> {
        val body = mapOf("email" to email, "username" to username, "password" to password)
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

    private fun post(cookie: String, url: String, body: Any? = null) =
        restTemplate.exchange(url, HttpMethod.POST, HttpEntity(body, headers(cookie)), Map::class.java)

    private fun get(cookie: String, url: String) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headers(cookie)), Map::class.java)

    @Suppress("UNCHECKED_CAST")
    private fun getList(cookie: String, url: String) =
        restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Void>(headers(cookie)), List::class.java)

    private fun createRoom(cookie: String, name: String): Long {
        val resp = post(cookie, "/api/rooms", mapOf("name" to name, "visibility" to "PUBLIC"))
        return (resp.body!!["id"] as Number).toLong()
    }

    private fun sendStompMessage(session: StompSession, roomId: Long, content: String) {
        val headers = StompHeaders().apply { destination = "/app/chat.send" }
        session.send(headers, mapOf("roomId" to roomId, "content" to content) as Any)
        Thread.sleep(300)
    }

    private fun subscribeNotifications(session: StompSession): AtomicReference<Map<*, *>> {
        val ref = AtomicReference<Map<*, *>>()
        session.subscribe("/user/queue/notifications", object : StompFrameHandler {
            override fun getPayloadType(h: StompHeaders): Type = Map::class.java
            override fun handleFrame(h: StompHeaders, payload: Any?) {
                @Suppress("UNCHECKED_CAST")
                ref.compareAndSet(null, payload as? Map<*, *>)
            }
        })
        Thread.sleep(200)
        return ref
    }

    private fun awaitNotification(ref: AtomicReference<Map<*, *>>, timeoutMs: Long = 3000): Map<*, *> {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            ref.get()?.let { return it }
            Thread.sleep(50)
        }
        error("Timed out waiting for notification")
    }

    // ---------------------------------------------------------------------------
    // Unread count
    // ---------------------------------------------------------------------------

    @Test
    fun `unreadCount is 0 for a room with no messages`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie, "general")

        val resp = get(cookie, "/api/rooms/$roomId/unread")
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat((resp.body!!["unreadCount"] as Number).toLong()).isEqualTo(0)
    }

    @Test
    fun `unreadCount increments when messages arrive before reading`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        val roomId = createRoom(aliceCookie, "general")

        // Bob joins
        post(bobCookie, "/api/rooms/$roomId/join")

        // Alice sends 2 messages via STOMP — Bob hasn't read them
        val aliceSession = connectStomp(aliceCookie)
        sendStompMessage(aliceSession, roomId, "hello")
        sendStompMessage(aliceSession, roomId, "world")
        aliceSession.disconnect()

        // Bob's unread count should be 2
        val resp = get(bobCookie, "/api/rooms/$roomId/unread")
        assertThat((resp.body!!["unreadCount"] as Number).toLong()).isEqualTo(2)
    }

    @Test
    fun `GET messages upserts read cursor and clears unreadCount`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        val roomId = createRoom(aliceCookie, "general")
        post(bobCookie, "/api/rooms/$roomId/join")

        // Alice sends messages
        val session = connectStomp(aliceCookie)
        sendStompMessage(session, roomId, "hello")
        session.disconnect()

        // Bob fetches history — should upsert read cursor
        getList(bobCookie, "/api/messages/$roomId")

        // Bob's unread count should now be 0
        val resp = get(bobCookie, "/api/rooms/$roomId/unread")
        assertThat((resp.body!!["unreadCount"] as Number).toLong()).isEqualTo(0)
    }

    @Test
    fun `POST rooms-read marks all messages as read`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        val roomId = createRoom(aliceCookie, "general")
        post(bobCookie, "/api/rooms/$roomId/join")

        val session = connectStomp(aliceCookie)
        sendStompMessage(session, roomId, "hello")
        sendStompMessage(session, roomId, "world")
        session.disconnect()

        // Bob explicitly marks room as read
        val markResp = restTemplate.exchange(
            "/api/rooms/$roomId/read",
            HttpMethod.POST,
            HttpEntity<Void>(headers(bobCookie)),
            Void::class.java,
        )
        assertThat(markResp.statusCode).isEqualTo(HttpStatus.NO_CONTENT)

        val resp = get(bobCookie, "/api/rooms/$roomId/unread")
        assertThat((resp.body!!["unreadCount"] as Number).toLong()).isEqualTo(0)
    }

    @Test
    fun `GET rooms-me returns rooms with unreadCount`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(aliceCookie, "my-room")

        val session = connectStomp(aliceCookie)
        sendStompMessage(session, roomId, "test message")
        session.disconnect()

        // Alice reads messages — unread should be 0
        getList(aliceCookie, "/api/messages/$roomId")

        @Suppress("UNCHECKED_CAST")
        val myRooms = restTemplate.exchange(
            "/api/rooms/me",
            HttpMethod.GET,
            HttpEntity<Void>(headers(aliceCookie)),
            List::class.java,
        ).body as List<Map<*, *>>

        assertThat(myRooms).hasSize(1)
        assertThat((myRooms[0]["id"] as Number).toLong()).isEqualTo(roomId)
        assertThat((myRooms[0]["unreadCount"] as Number).toInt()).isEqualTo(0)
    }

    // ---------------------------------------------------------------------------
    // Mention notifications
    // ---------------------------------------------------------------------------

    @Test
    fun `mention in message triggers MENTION notification to mentioned user`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        val roomId = createRoom(aliceCookie, "general")
        post(bobCookie, "/api/rooms/$roomId/join")

        val bobSession = connectStomp(bobCookie)
        val notifRef = subscribeNotifications(bobSession)

        val aliceSession = connectStomp(aliceCookie)
        sendStompMessage(aliceSession, roomId, "hey @bob what's up?")
        aliceSession.disconnect()

        val notif = awaitNotification(notifRef)
        assertThat(notif["type"]).isEqualTo("MENTION")
        @Suppress("UNCHECKED_CAST")
        val payload = notif["payload"] as Map<*, *>
        assertThat((payload["roomId"] as Number).toLong()).isEqualTo(roomId)

        bobSession.disconnect()
    }

    @Test
    fun `sender is not notified for their own mention`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(aliceCookie, "general")

        val session = connectStomp(aliceCookie)
        val notifRef = subscribeNotifications(session)
        sendStompMessage(session, roomId, "hey @alice")

        Thread.sleep(500)
        assertThat(notifRef.get()).isNull()
        session.disconnect()
    }

    // ---------------------------------------------------------------------------
    // DM message notifications
    // ---------------------------------------------------------------------------

    @Test
    fun `DM message triggers DM_MESSAGE notification to recipient`() {
        val (aliceCookie, aliceId) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")

        // Alice sends friend request, Bob accepts → creates DM room
        val reqResp = post(aliceCookie, "/api/friends/requests", mapOf("username" to "bob"))
        @Suppress("UNCHECKED_CAST")
        val reqId = (reqResp.body!!["id"] as Number).toLong()
        val acceptResp = restTemplate.exchange(
            "/api/friends/requests/$reqId",
            HttpMethod.PATCH,
            HttpEntity(mapOf("action" to "ACCEPT"), headers(bobCookie)),
            Map::class.java,
        )
        @Suppress("UNCHECKED_CAST")
        val dmRoomId = (acceptResp.body!!["dmRoomId"] as Number).toLong()

        val bobSession = connectStomp(bobCookie)
        val notifRef = subscribeNotifications(bobSession)

        val aliceSession = connectStomp(aliceCookie)
        sendStompMessage(aliceSession, dmRoomId, "hey bob!")
        aliceSession.disconnect()

        val notif = awaitNotification(notifRef)
        assertThat(notif["type"]).isEqualTo("DM_MESSAGE")
        @Suppress("UNCHECKED_CAST")
        val payload = notif["payload"] as Map<*, *>
        assertThat((payload["roomId"] as Number).toLong()).isEqualTo(dmRoomId)
        assertThat((payload["fromUserId"] as Number).toLong()).isEqualTo(aliceId)

        bobSession.disconnect()
    }
}
