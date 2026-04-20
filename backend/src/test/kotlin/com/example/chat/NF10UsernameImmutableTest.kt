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

// Requirements §2.1.2: "username is immutable after registration".
// There is deliberately no endpoint to change a username — enforcement is by absence.
// These tests verify (a) the profile/me endpoint never changes a username, and
// (b) any REST call that could theoretically update a username is rejected or absent.
class NF10UsernameImmutableTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository

    @AfterEach
    fun cleanup() {
        userRepository.deleteAll()
    }

    private fun register(email: String, username: String): Pair<String, Long> {
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            mapOf("email" to email, "username" to username, "password" to "s3cr3tP@ss"),
            Map::class.java,
        )
        val cookie = extractAuthCookie(resp)
        val userId = (resp.body!!["userId"] as Number).toLong()
        return cookie to userId
    }

    private fun headers(cookie: String) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        add("Cookie", "access_token=$cookie")
    }

    @Test
    fun `GET auth-me always returns the original registration username`() {
        val (cookie, _) = register("immutable@nf10.com", "originalname")

        val me = restTemplate.exchange(
            "/api/auth/me", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), Map::class.java,
        )
        assertThat(me.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(me.body!!["username"]).isEqualTo("originalname")
    }

    @Test
    fun `PATCH users-me does not exist — no username change endpoint`() {
        val (cookie, _) = register("patchme@nf10.com", "patchuser")

        // No such endpoint — must return 404 or 405, not 200
        val resp = restTemplate.exchange(
            "/api/users/me", HttpMethod.PATCH,
            HttpEntity(mapOf("username" to "newname"), headers(cookie)), Map::class.java,
        )
        assertThat(resp.statusCode).isIn(HttpStatus.NOT_FOUND, HttpStatus.METHOD_NOT_ALLOWED)
    }

    @Test
    fun `PUT users-me does not exist — no username change endpoint`() {
        val (cookie, _) = register("putme@nf10.com", "putuser")

        val resp = restTemplate.exchange(
            "/api/users/me", HttpMethod.PUT,
            HttpEntity(mapOf("username" to "newname"), headers(cookie)), Map::class.java,
        )
        assertThat(resp.statusCode).isIn(HttpStatus.NOT_FOUND, HttpStatus.METHOD_NOT_ALLOWED)
    }

    @Test
    fun `username in auth-me is stable across multiple requests`() {
        val (cookie, _) = register("stable@nf10.com", "stableuser")

        repeat(3) {
            val me = restTemplate.exchange(
                "/api/auth/me", HttpMethod.GET,
                HttpEntity<Void>(headers(cookie)), Map::class.java,
            )
            assertThat(me.body!!["username"]).isEqualTo("stableuser")
        }
    }
}
