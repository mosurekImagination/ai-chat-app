package com.example.chat

import com.example.chat.domain.message.MessageRepository
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
import org.springframework.messaging.converter.MappingJackson2MessageConverter
import org.springframework.messaging.simp.stomp.StompFrameHandler
import org.springframework.messaging.simp.stomp.StompHeaders
import org.springframework.messaging.simp.stomp.StompSession
import java.lang.reflect.Type
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class Slice5MessagingTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var messageRepository: MessageRepository

    @AfterEach
    fun cleanup() {
        messageRepository.deleteAll()
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

    private fun createRoom(cookie: String, name: String = "general"): Map<*, *> {
        val body = mapOf("name" to name, "visibility" to "PUBLIC")
        return restTemplate.exchange(
            "/api/rooms", HttpMethod.POST, HttpEntity(body, headers(cookie)), Map::class.java
        ).body!!
    }

    private fun joinRoom(cookie: String, roomId: Any?) {
        restTemplate.exchange(
            "/api/rooms/$roomId/join", HttpMethod.POST, HttpEntity<Void>(headers(cookie)), Void::class.java
        )
    }

    private fun subscribeAndCapture(session: StompSession, destination: String): AtomicReference<Map<*, *>> {
        val ref = AtomicReference<Map<*, *>>()
        session.subscribe(destination, object : StompFrameHandler {
            override fun getPayloadType(headers: StompHeaders): Type = Map::class.java
            override fun handleFrame(headers: StompHeaders, payload: Any?) {
                @Suppress("UNCHECKED_CAST")
                ref.set(payload as? Map<*, *>)
            }
        })
        return ref
    }

    private fun sendStomp(session: StompSession, payload: Map<String, Any?>) {
        val h = StompHeaders().apply { destination = "/app/chat.send" }
        session.send(h, payload as Any)
    }

    private fun awaitValue(ref: AtomicReference<Map<*, *>>, timeoutMs: Long = 3000): Map<*, *> {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            ref.get()?.let { return it }
            Thread.sleep(50)
        }
        error("Timed out waiting for STOMP message")
    }

    // ---------------------------------------------------------------------------
    // STOMP chat.send → MessageEvent delivered to room subscribers
    // ---------------------------------------------------------------------------

    @Test
    fun `chat send delivers MessageEvent to room subscribers`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        val roomId = room["id"]
        joinRoom(bobCookie, roomId)

        val aliceSession = connectStomp(aliceCookie)
        val bobSession = connectStomp(bobCookie)

        val aliceRef = subscribeAndCapture(aliceSession, "/topic/room.$roomId")
        val bobRef = subscribeAndCapture(bobSession, "/topic/room.$roomId")
        Thread.sleep(200) // let subscriptions register

        sendStomp(aliceSession, mapOf("roomId" to roomId, "content" to "Hello from Alice"))
        Thread.sleep(500)

        val aliceEvent = awaitValue(aliceRef)
        val bobEvent = awaitValue(bobRef)

        assertThat(aliceEvent["type"]).isEqualTo("NEW")
        @Suppress("UNCHECKED_CAST")
        val msg = aliceEvent["message"] as Map<*, *>
        assertThat(msg["content"]).isEqualTo("Hello from Alice")
        assertThat(msg["roomId"]).isEqualTo((roomId as Number).toInt())
        @Suppress("UNCHECKED_CAST")
        val sender = msg["sender"] as Map<*, *>
        assertThat(sender["username"]).isEqualTo("alice")
        assertThat(msg["deleted"]).isEqualTo(false)

        assertThat(bobEvent["type"]).isEqualTo("NEW")
        @Suppress("UNCHECKED_CAST")
        val bobMsg = bobEvent["message"] as Map<*, *>
        assertThat(bobMsg["content"]).isEqualTo("Hello from Alice")

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    @Test
    fun `chat send with tempId echoes tempId in MessageEvent`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val roomId = room["id"]

        val session = connectStomp(cookie)
        val ref = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "hi", "tempId" to "client-123"))
        Thread.sleep(500)

        val event = awaitValue(ref)
        @Suppress("UNCHECKED_CAST")
        val msg = event["message"] as Map<*, *>
        assertThat(msg["tempId"]).isEqualTo("client-123")

        session.disconnect()
    }

    @Test
    fun `non-member sending to room gets no broadcast`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        val roomId = room["id"]
        // bob does NOT join

        val aliceSession = connectStomp(aliceCookie)
        val bobSession = connectStomp(bobCookie)
        val ref = subscribeAndCapture(aliceSession, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(bobSession, mapOf("roomId" to roomId, "content" to "intruder"))
        Thread.sleep(600)

        assertThat(ref.get()).isNull()

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // Reply threads (parentMessageId)
    // ---------------------------------------------------------------------------

    @Test
    fun `reply message includes parentMessage in MessageEvent`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val roomId = room["id"]

        val session = connectStomp(cookie)
        val ref = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        // Send parent message
        sendStomp(session, mapOf("roomId" to roomId, "content" to "parent message"))
        Thread.sleep(500)
        val parentEvent = awaitValue(ref)
        @Suppress("UNCHECKED_CAST")
        val parentMsg = parentEvent["message"] as Map<*, *>
        val parentId = parentMsg["id"]

        // Reset and send reply
        ref.set(null)
        val h = StompHeaders().apply { destination = "/app/chat.send" }
        session.send(h, mapOf("roomId" to roomId, "content" to "reply", "parentMessageId" to parentId) as Any)
        Thread.sleep(500)

        val replyEvent = awaitValue(ref)
        @Suppress("UNCHECKED_CAST")
        val replyMsg = replyEvent["message"] as Map<*, *>
        @Suppress("UNCHECKED_CAST")
        val parent = replyMsg["parentMessage"] as Map<*, *>
        assertThat(parent["id"]).isEqualTo(parentId)
        assertThat(parent["content"]).isEqualTo("parent message")

        session.disconnect()
    }

    // ---------------------------------------------------------------------------
    // chat.edit
    // ---------------------------------------------------------------------------

    @Test
    fun `chat edit delivers EDITED MessageEvent`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val roomId = room["id"]

        val session = connectStomp(cookie)
        val ref = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "original"))
        Thread.sleep(500)
        val newEvent = awaitValue(ref)
        @Suppress("UNCHECKED_CAST")
        val msgId = (newEvent["message"] as Map<*, *>)["id"]

        ref.set(null)
        val h = StompHeaders().apply { destination = "/app/chat.edit" }
        session.send(h, mapOf("messageId" to msgId, "content" to "edited"))
        Thread.sleep(500)

        val editEvent = awaitValue(ref)
        assertThat(editEvent["type"]).isEqualTo("EDITED")
        @Suppress("UNCHECKED_CAST")
        val edited = editEvent["message"] as Map<*, *>
        assertThat(edited["content"]).isEqualTo("edited")
        assertThat(edited["editedAt"]).isNotNull()

        session.disconnect()
    }

    @Test
    fun `only message owner can edit`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        val roomId = room["id"]
        joinRoom(bobCookie, roomId)

        val aliceSession = connectStomp(aliceCookie)
        val bobSession = connectStomp(bobCookie)
        val aliceRef = subscribeAndCapture(aliceSession, "/topic/room.$roomId")
        val bobRef = subscribeAndCapture(bobSession, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(aliceSession, mapOf("roomId" to roomId, "content" to "alice message"))
        Thread.sleep(500)
        val newEvent = awaitValue(aliceRef)
        @Suppress("UNCHECKED_CAST")
        val msgId = (newEvent["message"] as Map<*, *>)["id"]

        aliceRef.set(null)
        bobRef.set(null)
        val h = StompHeaders().apply { destination = "/app/chat.edit" }
        bobSession.send(h, mapOf("messageId" to msgId, "content" to "bob hijack"))
        Thread.sleep(600)

        // No EDITED event should be delivered
        assertThat(aliceRef.get()).isNull()
        assertThat(bobRef.get()).isNull()

        aliceSession.disconnect()
        bobSession.disconnect()
    }

    // ---------------------------------------------------------------------------
    // chat.delete (soft delete)
    // ---------------------------------------------------------------------------

    @Test
    fun `chat delete delivers DELETED MessageEvent with deleted=true`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val roomId = room["id"]

        val session = connectStomp(cookie)
        val ref = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "to be deleted"))
        Thread.sleep(500)
        val newEvent = awaitValue(ref)
        @Suppress("UNCHECKED_CAST")
        val msgId = (newEvent["message"] as Map<*, *>)["id"]

        ref.set(null)
        val h = StompHeaders().apply { destination = "/app/chat.delete" }
        session.send(h, mapOf("messageId" to msgId))
        Thread.sleep(500)

        val deleteEvent = awaitValue(ref)
        assertThat(deleteEvent["type"]).isEqualTo("DELETED")
        @Suppress("UNCHECKED_CAST")
        val deleted = deleteEvent["message"] as Map<*, *>
        assertThat(deleted["deleted"]).isEqualTo(true)

        session.disconnect()
    }

    // ---------------------------------------------------------------------------
    // GET /api/messages/{roomId} — cursor-based pagination
    // ---------------------------------------------------------------------------

    @Test
    fun `get message history returns messages for member`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val roomId = room["id"]

        val session = connectStomp(cookie)
        val ref = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "msg1"))
        sendStomp(session, mapOf("roomId" to roomId, "content" to "msg2"))
        Thread.sleep(800)

        val resp = restTemplate.exchange(
            "/api/messages/$roomId", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(resp.body!!).hasSize(2)

        session.disconnect()
    }

    @Test
    fun `get message history cursor before filters correctly`() {
        val cookie = register("alice@example.com", "alice")
        val room = createRoom(cookie)
        val roomId = room["id"]

        val session = connectStomp(cookie)
        val ref = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "msg1"))
        Thread.sleep(300)
        sendStomp(session, mapOf("roomId" to roomId, "content" to "msg2"))
        Thread.sleep(500)

        // Get all to find the newest message id
        val allResp = restTemplate.exchange(
            "/api/messages/$roomId", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), List::class.java
        )
        @Suppress("UNCHECKED_CAST")
        val all = allResp.body!! as List<Map<*, *>>
        assertThat(all).hasSize(2)
        val newestId = (all[0]["id"] as Number).toLong()

        // before=newestId should return only the older message
        val beforeResp = restTemplate.exchange(
            "/api/messages/$roomId?before=$newestId", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), List::class.java
        )
        assertThat(beforeResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(beforeResp.body!!).hasSize(1)

        session.disconnect()
    }

    @Test
    fun `get message history returns 403 for non-member`() {
        val aliceCookie = register("alice@example.com", "alice")
        val bobCookie = register("bob@example.com", "bob")
        val room = createRoom(aliceCookie)
        val roomId = room["id"]

        val resp = restTemplate.exchange(
            "/api/messages/$roomId", HttpMethod.GET,
            HttpEntity<Void>(headers(bobCookie)), Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(resp.body!!["error"]).isEqualTo("NOT_MEMBER")
    }

    @Test
    fun `get message history returns 401 for unauthenticated`() {
        val aliceCookie = register("alice@example.com", "alice")
        val room = createRoom(aliceCookie)
        val roomId = room["id"]

        val resp = restTemplate.getForEntity("/api/messages/$roomId", Map::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }
}
