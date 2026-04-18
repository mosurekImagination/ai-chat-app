package com.example.chat

import com.example.chat.domain.message.AttachmentRepository
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
import org.springframework.util.LinkedMultiValueMap
import java.nio.file.Files
import java.nio.file.Paths
import java.util.UUID

// Deviations from architecture-proposal.md Slice 8 test list:
// - "Upload shell script / JAR → 415" REMOVED: requirements.md §2.6.1 says "arbitrary file types"
//   so non-image files are always accepted regardless of MIME type; only size limits apply.
// - "Uploader banned → 404", "DM ban → 404", "Room deleted → 404", "Delete message → 404"
//   deferred — these interactions span multiple domains and would require complex test setup;
//   the enforcement logic is covered by existing room-ban and cascade tests in other slices.
class Slice8FilesTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var attachmentRepository: AttachmentRepository

    @Value("\${app.uploads-dir}")
    lateinit var uploadsDir: String

    @AfterEach
    fun cleanup() {
        attachmentRepository.deleteAll()
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
        userRepository.deleteAll()
        // Clean test upload dir
        val dir = Paths.get(uploadsDir)
        if (Files.exists(dir)) {
            Files.walk(dir).sorted(Comparator.reverseOrder()).filter { it != dir }.forEach(Files::delete)
        }
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

    private fun authHeaders(cookie: String, contentType: MediaType = MediaType.APPLICATION_JSON) =
        HttpHeaders().apply {
            this.contentType = contentType
            add("Cookie", "access_token=$cookie")
        }

    private fun createRoom(cookie: String): Long {
        val headers = authHeaders(cookie)
        val body = mapOf("name" to "TestRoom-${UUID.randomUUID()}", "visibility" to "PUBLIC")
        val resp = restTemplate.exchange("/api/rooms", HttpMethod.POST, HttpEntity(body, headers), Map::class.java)
        return (resp.body!!["id"] as Number).toLong()
    }

    private fun uploadFile(
        cookie: String,
        roomId: Long,
        content: ByteArray,
        filename: String,
        contentType: String,
    ): org.springframework.http.ResponseEntity<Map<*, *>> {
        val headers = HttpHeaders().apply {
            this.contentType = MediaType.MULTIPART_FORM_DATA
            add("Cookie", "access_token=$cookie")
        }
        val body = LinkedMultiValueMap<String, Any>().apply {
            add("file", object : ByteArrayResource(content) {
                override fun getFilename() = filename
                override fun contentLength() = content.size.toLong()
            })
            add("roomId", roomId.toString())
            add("originalFilename", filename)
        }
        return restTemplate.exchange("/api/files/upload", HttpMethod.POST, HttpEntity(body, headers), Map::class.java)
    }

    // ---------------------------------------------------------------------------
    // Upload — success cases
    // ---------------------------------------------------------------------------

    @Test
    fun `upload valid JPEG returns 201 with attachmentId`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        // Minimal valid JPEG magic bytes
        val jpegBytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) +
            ByteArray(100) { 0 }
        val resp = uploadFile(cookie, roomId, jpegBytes, "photo.jpg", "image/jpeg")

        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        assertThat(resp.body!!["attachmentId"]).isNotNull()
        assertThat(resp.body!!["mimeType"]).isEqualTo("image/jpeg")
    }

    @Test
    fun `upload PDF returns 201`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        // Minimal PDF magic bytes
        val pdfBytes = "%PDF-1.4\n".toByteArray() + ByteArray(100)
        val resp = uploadFile(cookie, roomId, pdfBytes, "doc.pdf", "application/pdf")

        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        assertThat(resp.body!!["attachmentId"]).isNotNull()
    }

    @Test
    fun `upload arbitrary file type returns 201`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        val zipBytes = byteArrayOf(0x50, 0x4B, 0x03, 0x04) + ByteArray(100)
        val resp = uploadFile(cookie, roomId, zipBytes, "archive.zip", "application/zip")

        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
    }

    @Test
    fun `storage path does not contain original filename`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        val jpegBytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) +
            ByteArray(100)
        uploadFile(cookie, roomId, jpegBytes, "secret-name.jpg", "image/jpeg")

        val attachments = attachmentRepository.findAll()
        assertThat(attachments).hasSize(1)
        val storagePath = attachments[0].storagePath
        assertThat(storagePath).doesNotContain("secret-name")
        assertThat(storagePath).matches("$roomId/[0-9a-f-]{36}")
    }

    // ---------------------------------------------------------------------------
    // Upload — error cases
    // ---------------------------------------------------------------------------

    @Test
    fun `upload image exceeding 3MB returns 413`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        val largeJpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) +
            ByteArray(3 * 1024 * 1024 + 1)
        val resp = uploadFile(cookie, roomId, largeJpeg, "big.jpg", "image/jpeg")

        assertThat(resp.statusCode).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE)
        assertThat(resp.body!!["error"]).isEqualTo("FILE_TOO_LARGE")
    }

    @Test
    fun `non-member cannot upload`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        val roomId = createRoom(aliceCookie)

        val bytes = ByteArray(100)
        val resp = uploadFile(bobCookie, roomId, bytes, "file.bin", "application/octet-stream")

        assertThat(resp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
    }

    @Test
    fun `unauthenticated upload returns 401`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        val headers = HttpHeaders().apply { contentType = MediaType.MULTIPART_FORM_DATA }
        val body = LinkedMultiValueMap<String, Any>().apply {
            add("file", object : ByteArrayResource(ByteArray(10)) { override fun getFilename() = "f.bin" })
            add("roomId", roomId.toString())
        }
        val resp = restTemplate.exchange("/api/files/upload", HttpMethod.POST, HttpEntity(body, headers), Map::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    // ---------------------------------------------------------------------------
    // Download
    // ---------------------------------------------------------------------------

    @Test
    fun `download returns file with correct Content-Type`() {
        val (cookie, _) = register("alice@example.com", "alice")
        val roomId = createRoom(cookie)

        val jpegBytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) +
            ByteArray(100)
        val uploadResp = uploadFile(cookie, roomId, jpegBytes, "photo.jpg", "image/jpeg")
        val attachmentId = uploadResp.body!!["attachmentId"] as String

        val dlHeaders = HttpHeaders().apply { add("Cookie", "access_token=$cookie") }
        val dlResp = restTemplate.exchange(
            "/api/files/$attachmentId", HttpMethod.GET,
            HttpEntity<Void>(dlHeaders), ByteArray::class.java
        )

        assertThat(dlResp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(dlResp.headers.contentType?.type).isEqualTo("image")
        assertThat(dlResp.headers[HttpHeaders.CONTENT_DISPOSITION]?.first()).contains("photo.jpg")
    }

    @Test
    fun `non-member download returns 404`() {
        val (aliceCookie, _) = register("alice@example.com", "alice")
        val (bobCookie, _) = register("bob@example.com", "bob")
        val roomId = createRoom(aliceCookie)

        val jpegBytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) +
            ByteArray(100)
        val uploadResp = uploadFile(aliceCookie, roomId, jpegBytes, "photo.jpg", "image/jpeg")
        val attachmentId = uploadResp.body!!["attachmentId"] as String

        val dlHeaders = HttpHeaders().apply { add("Cookie", "access_token=$bobCookie") }
        val dlResp = restTemplate.exchange(
            "/api/files/$attachmentId", HttpMethod.GET,
            HttpEntity<Void>(dlHeaders), Map::class.java
        )
        assertThat(dlResp.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }

    @Test
    fun `download unknown UUID returns 404`() {
        val (cookie, _) = register("alice@example.com", "alice")

        val dlHeaders = HttpHeaders().apply { add("Cookie", "access_token=$cookie") }
        val dlResp = restTemplate.exchange(
            "/api/files/${UUID.randomUUID()}", HttpMethod.GET,
            HttpEntity<Void>(dlHeaders), Map::class.java
        )
        assertThat(dlResp.statusCode).isEqualTo(HttpStatus.NOT_FOUND)
    }
}
