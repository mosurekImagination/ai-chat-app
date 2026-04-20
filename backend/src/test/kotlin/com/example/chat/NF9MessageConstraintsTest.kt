package com.example.chat

import com.example.chat.domain.message.AttachmentRepository
import com.example.chat.domain.message.MessageRepository
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.domain.user.UserRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.core.io.ByteArrayResource
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.messaging.simp.stomp.StompFrameHandler
import org.springframework.messaging.simp.stomp.StompHeaders
import org.springframework.messaging.simp.stomp.StompSession
import org.springframework.util.LinkedMultiValueMap
import java.lang.reflect.Type
import java.nio.file.Files
import java.nio.file.Paths
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

class NF9MessageConstraintsTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var messageRepository: MessageRepository
    @Autowired lateinit var attachmentRepository: AttachmentRepository

    @Value("\${app.uploads-dir}")
    lateinit var uploadsDir: String

    @AfterEach
    fun cleanup() {
        attachmentRepository.deleteAll()
        messageRepository.deleteAll()
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
        userRepository.deleteAll()
        val dir = Paths.get(uploadsDir)
        if (Files.exists(dir)) {
            Files.walk(dir).sorted(Comparator.reverseOrder()).filter { it != dir }.forEach(Files::delete)
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun register(email: String, username: String): String {
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            mapOf("email" to email, "username" to username, "password" to "s3cr3tP@ss"),
            Map::class.java,
        )
        return extractAuthCookie(resp)
    }

    private fun jsonHeaders(cookie: String) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        add("Cookie", "access_token=$cookie")
    }

    private fun createRoom(cookie: String): Long {
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "room-${UUID.randomUUID()}", "visibility" to "PUBLIC"), jsonHeaders(cookie)),
            Map::class.java,
        )
        return (resp.body!!["id"] as Number).toLong()
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

    private fun uploadFile(cookie: String, roomId: Long, comment: String? = null): UUID {
        val headers = HttpHeaders().apply {
            contentType = MediaType.MULTIPART_FORM_DATA
            add("Cookie", "access_token=$cookie")
        }
        val content = "hello file content".toByteArray()
        val body = LinkedMultiValueMap<String, Any>().apply {
            add("file", object : ByteArrayResource(content) {
                override fun getFilename() = "test.txt"
                override fun contentLength() = content.size.toLong()
            })
            add("roomId", roomId.toString())
            add("originalFilename", "test.txt")
            if (comment != null) add("comment", comment)
        }
        val resp = restTemplate.exchange(
            "/api/files/upload", HttpMethod.POST, HttpEntity(body, headers), Map::class.java,
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        return UUID.fromString(resp.body!!["attachmentId"].toString())
    }

    // ---------------------------------------------------------------------------
    // 3KB message content limit (req §2.5.2)
    // ---------------------------------------------------------------------------

    @Test
    fun `STOMP message exceeding 3072 bytes UTF-8 is silently dropped — not delivered`() {
        val cookie = register("limits@nf9.com", "limitsnf9")
        val roomId = createRoom(cookie)

        val session = connectStomp(cookie)
        val roomRef = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        // 3073 ASCII chars = 3073 bytes — just over the 3072-byte limit
        val oversized = "x".repeat(3073)
        sendStomp(session, mapOf("roomId" to roomId, "content" to oversized))

        Thread.sleep(600)
        assertThat(roomRef.get()).isNull()

        session.disconnect()
    }

    @Test
    fun `STOMP message of exactly 3072 bytes is accepted and delivered`() {
        val cookie = register("exact@nf9.com", "exactnf9")
        val roomId = createRoom(cookie)

        val session = connectStomp(cookie)
        val roomRef = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        val exact = "y".repeat(3072)
        sendStomp(session, mapOf("roomId" to roomId, "content" to exact))

        val deadline = System.currentTimeMillis() + 3000
        while (System.currentTimeMillis() < deadline && roomRef.get() == null) Thread.sleep(50)

        assertThat(roomRef.get()).isNotNull()
        @Suppress("UNCHECKED_CAST")
        val msg = roomRef.get()!!["message"] as Map<*, *>
        assertThat(msg["content"]).isEqualTo(exact)

        session.disconnect()
    }

    // ---------------------------------------------------------------------------
    // Attachment comment field (req §2.6.3)
    // ---------------------------------------------------------------------------

    @Test
    fun `attachment comment is persisted and returned in message history`() {
        val cookie = register("commenter@nf9.com", "commenternf9")
        val roomId = createRoom(cookie)

        val attachmentId = uploadFile(cookie, roomId, comment = "look at this")

        val session = connectStomp(cookie)
        val roomRef = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "see attachment", "attachmentId" to attachmentId))

        val deadline = System.currentTimeMillis() + 3000
        while (System.currentTimeMillis() < deadline && roomRef.get() == null) Thread.sleep(50)
        assertThat(roomRef.get()).isNotNull()

        // Verify via message history
        val histResp = restTemplate.exchange(
            "/api/messages/$roomId", HttpMethod.GET,
            HttpEntity<Void>(jsonHeaders(cookie)), List::class.java,
        )
        assertThat(histResp.statusCode).isEqualTo(HttpStatus.OK)
        @Suppress("UNCHECKED_CAST")
        val messages = histResp.body as List<Map<*, *>>
        val attachments = messages.flatMap {
            @Suppress("UNCHECKED_CAST")
            it["attachments"] as List<Map<*, *>>
        }
        assertThat(attachments).isNotEmpty
        assertThat(attachments.first()["comment"]).isEqualTo("look at this")

        session.disconnect()
    }

    @Test
    fun `attachment uploaded without comment has null comment in message history`() {
        val cookie = register("nocomment@nf9.com", "nocommentnf9")
        val roomId = createRoom(cookie)

        val attachmentId = uploadFile(cookie, roomId, comment = null)

        val session = connectStomp(cookie)
        val roomRef = subscribeAndCapture(session, "/topic/room.$roomId")
        Thread.sleep(200)

        sendStomp(session, mapOf("roomId" to roomId, "content" to "no comment", "attachmentId" to attachmentId))

        val deadline = System.currentTimeMillis() + 3000
        while (System.currentTimeMillis() < deadline && roomRef.get() == null) Thread.sleep(50)
        assertThat(roomRef.get()).isNotNull()

        val histResp = restTemplate.exchange(
            "/api/messages/$roomId", HttpMethod.GET,
            HttpEntity<Void>(jsonHeaders(cookie)), List::class.java,
        )
        @Suppress("UNCHECKED_CAST")
        val messages = histResp.body as List<Map<*, *>>
        val attachments = messages.flatMap {
            @Suppress("UNCHECKED_CAST")
            it["attachments"] as List<Map<*, *>>
        }
        assertThat(attachments).isNotEmpty
        assertThat(attachments.first()["comment"]).isNull()

        session.disconnect()
    }
}
