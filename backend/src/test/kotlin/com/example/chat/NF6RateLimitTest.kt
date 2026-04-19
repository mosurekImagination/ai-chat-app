package com.example.chat

import com.example.chat.config.LoginRateLimiter
import com.example.chat.domain.user.UserRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpStatus
import org.springframework.test.context.TestPropertySource

@TestPropertySource(properties = ["app.login-rate-limit=10"])
class NF6RateLimitTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var loginRateLimiter: LoginRateLimiter

    @BeforeEach
    fun resetBuckets() {
        loginRateLimiter.reset()
    }

    @AfterEach
    fun cleanup() {
        loginRateLimiter.reset()
        userRepository.deleteAll()
    }

    @Test
    fun `11th failed login attempt from same IP returns 429`() {
        // Register via API so the password is properly bcrypt-hashed
        restTemplate.postForEntity("/api/auth/register",
            mapOf("email" to "nf6@example.com", "username" to "nf6user", "password" to "CorrectPass1!"),
            Map::class.java)

        val payload = mapOf("email" to "nf6@example.com", "password" to "WrongPassword1!", "keepSignedIn" to false)

        // Attempts 1–10: wrong password → 401 UNAUTHORIZED
        repeat(10) { i ->
            val resp = restTemplate.postForEntity("/api/auth/login", payload, Map::class.java)
            assertThat(resp.statusCode)
                .`as`("attempt ${i + 1} should be 401")
                .isEqualTo(HttpStatus.UNAUTHORIZED)
        }

        // Attempt 11: rate limit exhausted → 429
        val resp = restTemplate.postForEntity("/api/auth/login", payload, Map::class.java)
        assertThat(resp.statusCode)
            .`as`("11th attempt should be rate limited (429)")
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS)

        @Suppress("UNCHECKED_CAST")
        val body = resp.body as? Map<String, Any>
        assertThat(body?.get("error")).isEqualTo("RATE_LIMITED")
    }
}
