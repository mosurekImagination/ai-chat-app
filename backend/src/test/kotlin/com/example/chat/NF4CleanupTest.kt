package com.example.chat

import com.example.chat.domain.user.CleanupService
import com.example.chat.domain.user.PasswordResetToken
import com.example.chat.domain.user.PasswordResetTokenRepository
import com.example.chat.domain.user.Session
import com.example.chat.domain.user.SessionRepository
import com.example.chat.domain.user.User
import com.example.chat.domain.user.UserRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.web.client.TestRestTemplate
import java.time.Instant

class NF4CleanupTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var cleanupService: CleanupService
    @Autowired lateinit var sessionRepository: SessionRepository
    @Autowired lateinit var passwordResetTokenRepository: PasswordResetTokenRepository
    @Autowired lateinit var userRepository: UserRepository

    @AfterEach
    fun cleanup() {
        passwordResetTokenRepository.deleteAll()
        sessionRepository.deleteAll()
        userRepository.deleteAll()
    }

    @Test
    fun `purgeStaleData removes expired sessions and stale password reset tokens`() {
        val user = userRepository.save(User(email = "nf4@example.com", username = "nf4user", passwordHash = "x"))

        val past = Instant.now().minusSeconds(3600)
        val future = Instant.now().plusSeconds(3600)

        // 5 expired sessions + 1 still-valid session
        repeat(5) {
            sessionRepository.save(Session(userId = user.id, tokenHash = "exp$it", browserInfo = null, ip = null, expiresAt = past))
        }
        sessionRepository.save(Session(userId = user.id, tokenHash = "valid", browserInfo = null, ip = null, expiresAt = future))

        // 3 expired tokens + 2 used tokens + 1 still-valid token
        repeat(3) {
            passwordResetTokenRepository.save(PasswordResetToken(userId = user.id, tokenHash = "expTok$it", expiresAt = past))
        }
        repeat(2) {
            passwordResetTokenRepository.save(PasswordResetToken(userId = user.id, tokenHash = "usedTok$it", expiresAt = future, usedAt = past))
        }
        passwordResetTokenRepository.save(PasswordResetToken(userId = user.id, tokenHash = "validTok", expiresAt = future))

        assertThat(sessionRepository.count()).isEqualTo(6)
        assertThat(passwordResetTokenRepository.count()).isEqualTo(6)

        cleanupService.purgeStaleData()

        assertThat(sessionRepository.count()).`as`("only the valid session should remain").isEqualTo(1)
        assertThat(passwordResetTokenRepository.count()).`as`("only the valid token should remain").isEqualTo(1)
        assertThat(sessionRepository.findAll().first().tokenHash).isEqualTo("valid")
        assertThat(passwordResetTokenRepository.findAll().first().tokenHash).isEqualTo("validTok")
    }

    @Test
    fun `GET api_admin_stats returns expected counts`() {
        val resp = restTemplate.getForEntity("/api/admin/stats", Map::class.java)
        assertThat(resp.statusCode.value()).isEqualTo(200)
        @Suppress("UNCHECKED_CAST")
        val body = resp.body as Map<String, Any>
        assertThat(body).containsKeys("expiredSessions", "stalePasswordTokens", "totalUsers", "totalRooms", "totalMessages")
    }
}
