package com.example.chat

import com.example.chat.domain.user.PasswordResetTokenRepository
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
import java.time.Instant

// Deviation from architecture-proposal.md: the proposal says invalid/expired/used tokens
// return 400. Pre-written tests are authoritative — all invalid states return 200 (no enumeration).
// Also: proposal says "bcrypt hash" for token_hash; implementation uses SHA-256 (bcrypt is
// non-deterministic and cannot be looked up by re-hashing the candidate value).
class Slice9PasswordResetTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var passwordResetTokenRepository: PasswordResetTokenRepository

    @AfterEach
    fun cleanup() {
        passwordResetTokenRepository.deleteAll()
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

    private fun post(url: String, body: Any?): org.springframework.http.ResponseEntity<Map<*, *>> {
        val headers = HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON }
        return restTemplate.exchange(url, HttpMethod.POST, HttpEntity(body, headers), Map::class.java)
    }

    private fun postAuth(cookie: String, url: String, body: Any?): org.springframework.http.ResponseEntity<Map<*, *>> {
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            add("Cookie", "access_token=$cookie")
        }
        return restTemplate.exchange(url, HttpMethod.POST, HttpEntity(body, headers), Map::class.java)
    }

    // ---------------------------------------------------------------------------
    // forgot-password
    // ---------------------------------------------------------------------------

    @Test
    fun `forgot-password always returns 200 for known email`() {
        register("alice@example.com", "alice")

        val resp = post("/api/auth/forgot-password", mapOf("email" to "alice@example.com"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `forgot-password returns 200 even for unknown email (no enumeration)`() {
        val resp = post("/api/auth/forgot-password", mapOf("email" to "nobody@example.com"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(passwordResetTokenRepository.findAll()).isEmpty()
    }

    @Test
    fun `forgot-password creates a token row in DB`() {
        register("alice@example.com", "alice")
        post("/api/auth/forgot-password", mapOf("email" to "alice@example.com"))
        assertThat(passwordResetTokenRepository.findAll()).hasSize(1)
        val token = passwordResetTokenRepository.findAll().first()
        assertThat(token.usedAt).isNull()
        assertThat(token.expiresAt).isAfter(Instant.now())
    }

    // ---------------------------------------------------------------------------
    // reset-password
    // ---------------------------------------------------------------------------

    @Test
    fun `reset-password with valid token updates password`() {
        val (_, userId) = register("alice@example.com", "alice")

        // Trigger forgot to create the token
        post("/api/auth/forgot-password", mapOf("email" to "alice@example.com"))

        // Get the raw token from DB (test bypasses email)
        val tokenRow = passwordResetTokenRepository.findAll().first()
        // We stored SHA-256 hash — we need the raw token.
        // Regenerate: call forgotPassword again and capture the token from the repo
        // Actually we can't recover the raw token from the hash directly.
        // Instead, inject a known token by saving a row with a known SHA-256 hash.
        passwordResetTokenRepository.deleteAll()

        val knownRaw = "test-reset-token-12345"
        val knownHash = sha256Hex(knownRaw)
        passwordResetTokenRepository.save(
            com.example.chat.domain.user.PasswordResetToken(
                userId = userId,
                tokenHash = knownHash,
                expiresAt = Instant.now().plusSeconds(900),
            )
        )

        val resp = post("/api/auth/reset-password", mapOf("token" to knownRaw, "newPassword" to "newPass1!"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)

        // Verify new password works for login
        val loginResp = post("/api/auth/login", mapOf("email" to "alice@example.com", "password" to "newPass1!"))
        assertThat(loginResp.statusCode).isEqualTo(HttpStatus.OK)

        // Token is marked as used
        val used = passwordResetTokenRepository.findAll().first()
        assertThat(used.usedAt).isNotNull()
    }

    @Test
    fun `reset-password with expired token returns 200 (no enumeration)`() {
        val (_, userId) = register("alice@example.com", "alice")

        val knownRaw = "expired-token-xyz"
        passwordResetTokenRepository.save(
            com.example.chat.domain.user.PasswordResetToken(
                userId = userId,
                tokenHash = sha256Hex(knownRaw),
                expiresAt = Instant.now().minusSeconds(1),  // already expired
            )
        )

        val resp = post("/api/auth/reset-password", mapOf("token" to knownRaw, "newPassword" to "newPass1!"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)

        // Password should NOT have changed — login with old password still works
        val loginResp = post("/api/auth/login", mapOf("email" to "alice@example.com", "password" to "s3cr3tP@ss"))
        assertThat(loginResp.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `reset-password with already-used token returns 200 and does not update password`() {
        val (_, userId) = register("alice@example.com", "alice")

        val knownRaw = "used-token-abc"
        passwordResetTokenRepository.save(
            com.example.chat.domain.user.PasswordResetToken(
                userId = userId,
                tokenHash = sha256Hex(knownRaw),
                expiresAt = Instant.now().plusSeconds(900),
                usedAt = Instant.now().minusSeconds(60),  // already used
            )
        )

        val resp = post("/api/auth/reset-password", mapOf("token" to knownRaw, "newPassword" to "newPass1!"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)

        // Old password still works
        val loginResp = post("/api/auth/login", mapOf("email" to "alice@example.com", "password" to "s3cr3tP@ss"))
        assertThat(loginResp.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `reset-password with unknown token returns 200 (no enumeration)`() {
        val resp = post("/api/auth/reset-password", mapOf("token" to "no-such-token", "newPassword" to "newPass1!"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
    }

    // ---------------------------------------------------------------------------
    // change-password (authenticated)
    // ---------------------------------------------------------------------------

    @Test
    fun `change-password with correct current password succeeds`() {
        val (cookie, _) = register("alice@example.com", "alice")

        val resp = postAuth(cookie, "/api/auth/change-password",
            mapOf("currentPassword" to "s3cr3tP@ss", "newPassword" to "newPass1!"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)

        // New password works
        val loginResp = post("/api/auth/login", mapOf("email" to "alice@example.com", "password" to "newPass1!"))
        assertThat(loginResp.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `change-password with wrong current password returns 400`() {
        val (cookie, _) = register("alice@example.com", "alice")

        val resp = postAuth(cookie, "/api/auth/change-password",
            mapOf("currentPassword" to "wrongPassword!", "newPassword" to "newPass1!"))
        assertThat(resp.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(resp.body!!["error"]).isEqualTo("WRONG_CURRENT_PASSWORD")
    }

    // ---------------------------------------------------------------------------
    // Helper: same SHA-256 as UserService uses
    // ---------------------------------------------------------------------------

    private fun sha256Hex(input: String): String {
        val hash = java.security.MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray(Charsets.UTF_8))
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(hash)
    }
}
