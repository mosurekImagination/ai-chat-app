package com.example.chat

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

class Slice3JwtStompTest : AbstractIntegrationTest() {

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Autowired
    lateinit var userRepository: UserRepository

    @AfterEach
    fun cleanup() {
        userRepository.deleteAll()
    }

    private fun registerAndGetCookie(): String {
        val body = mapOf(
            "email" to "jwt_test@example.com",
            "username" to "jwt_test_user",
            "password" to "s3cr3tP@ss"
        )
        val resp = restTemplate.postForEntity("/api/auth/register", body, Map::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        return resp.headers["Set-Cookie"]
            ?.firstOrNull { it.startsWith("access_token=") }
            ?.substringAfter("access_token=")
            ?.substringBefore(";")
            ?: error("access_token cookie missing after register")
    }

    // ---------------------------------------------------------------------------
    // JWT filter on REST endpoints
    // ---------------------------------------------------------------------------

    @Test
    fun `protected endpoint returns 401 without cookie`() {
        val resp = restTemplate.getForEntity("/api/rooms", Any::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `protected endpoint returns 200 with valid access_token cookie`() {
        val cookie = registerAndGetCookie()
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            add("Cookie", "access_token=$cookie")
        }
        val resp = restTemplate.exchange(
            "/api/rooms",
            HttpMethod.GET,
            HttpEntity<Void>(headers),
            Any::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
    }

    @Test
    fun `protected endpoint returns 401 with tampered JWT`() {
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            add("Cookie", "access_token=eyJhbGciOiJIUzI1NiJ9.tampered.signature")
        }
        val resp = restTemplate.exchange(
            "/api/rooms",
            HttpMethod.GET,
            HttpEntity<Void>(headers),
            Any::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    // ---------------------------------------------------------------------------
    // STOMP auth
    // ---------------------------------------------------------------------------

    @Test
    fun `stomp connect with valid access_token cookie succeeds`() {
        val cookie = registerAndGetCookie()
        // connectStomp throws if the connection fails or times out
        val session = connectStomp(cookie)
        assertThat(session.isConnected).isTrue()
        session.disconnect()
    }

    @Test
    fun `stomp connect without cookie is rejected`() {
        // connectStomp with an empty/invalid cookie should fail to connect.
        // We expect either an exception or a disconnected session within the timeout.
        var connected = false
        try {
            val session = connectStomp("invalid-token-value")
            connected = session.isConnected
            if (connected) session.disconnect()
        } catch (_: Exception) {
            // connection refused or error frame — expected
        }
        assertThat(connected).isFalse()
    }
}
