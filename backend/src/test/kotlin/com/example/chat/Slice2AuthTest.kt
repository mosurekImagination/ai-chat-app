package com.example.chat

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

class Slice2AuthTest : AbstractIntegrationTest() {

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private fun registerBody(
        email: String = "alice@example.com",
        username: String = "alice",
        password: String = "s3cr3tP@ss"
    ) = mapOf("email" to email, "username" to username, "password" to password)

    private fun loginBody(
        email: String = "alice@example.com",
        password: String = "s3cr3tP@ss",
        keepSignedIn: Boolean = false
    ) = mapOf("email" to email, "password" to password, "keepSignedIn" to keepSignedIn)

    /** Registers alice and returns the Set-Cookie value for access_token. */
    private fun registerAliceAndGetCookie(): String {
        val resp = restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        return extractCookie(resp.headers, "access_token")
            ?: error("access_token cookie missing after register")
    }

    private fun extractCookie(headers: HttpHeaders, name: String): String? =
        headers["Set-Cookie"]
            ?.firstOrNull { it.startsWith("$name=") }
            ?.substringAfter("$name=")
            ?.substringBefore(";")

    private fun requestWithCookie(cookie: String): HttpHeaders =
        HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            add("Cookie", "access_token=$cookie")
        }

    @AfterEach
    fun cleanup() {
        // Wipe all users so each test starts clean.
        // UserRepository will be injected once the agent implements it.
        // For now tests must be self-contained or the agent must add the injection here.
    }

    // ---------------------------------------------------------------------------
    // Register
    // ---------------------------------------------------------------------------

    @Test
    fun `register returns 201 and sets access_token cookie`() {
        val resp = restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)

        assertThat(resp.statusCode).isEqualTo(HttpStatus.CREATED)
        val cookie = extractCookie(resp.headers, "access_token")
        assertThat(cookie).isNotBlank()
        val body = resp.body!!
        assertThat(body["userId"]).isNotNull()
        assertThat(body["username"]).isEqualTo("alice")
        assertThat(body["accessTokenExpiresAt"]).isNotNull()
    }

    @Test
    fun `register with duplicate email returns 409 DUPLICATE_EMAIL`() {
        restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            registerBody(username = "alice2"),   // different username, same email
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(resp.body!!["error"]).isEqualTo("DUPLICATE_EMAIL")
    }

    @Test
    fun `register with duplicate username returns 409 DUPLICATE_USERNAME`() {
        restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            registerBody(email = "other@example.com"),  // different email, same username
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.CONFLICT)
        assertThat(resp.body!!["error"]).isEqualTo("DUPLICATE_USERNAME")
    }

    @Test
    fun `register with short password returns 400 INVALID_REQUEST`() {
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            registerBody(password = "abc"),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(resp.body!!["error"]).isEqualTo("INVALID_REQUEST")
    }

    @Test
    fun `register with blank email returns 400 INVALID_REQUEST`() {
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            registerBody(email = ""),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(resp.body!!["error"]).isEqualTo("INVALID_REQUEST")
    }

    // ---------------------------------------------------------------------------
    // Login
    // ---------------------------------------------------------------------------

    @Test
    fun `login returns 200 and sets both cookies`() {
        restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)
        val resp = restTemplate.postForEntity("/api/auth/login", loginBody(), Map::class.java)

        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(extractCookie(resp.headers, "access_token")).isNotBlank()
        assertThat(extractCookie(resp.headers, "refresh_token")).isNotBlank()
        val body = resp.body!!
        assertThat(body["userId"]).isNotNull()
        assertThat(body["username"]).isEqualTo("alice")
        assertThat(body["accessTokenExpiresAt"]).isNotNull()
    }

    @Test
    fun `login with wrong password returns 401 INVALID_CREDENTIALS`() {
        restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)
        val resp = restTemplate.postForEntity(
            "/api/auth/login",
            loginBody(password = "wrongpassword"),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
        assertThat(resp.body!!["error"]).isEqualTo("INVALID_CREDENTIALS")
    }

    @Test
    fun `login with unknown email returns 401 INVALID_CREDENTIALS`() {
        val resp = restTemplate.postForEntity(
            "/api/auth/login",
            loginBody(email = "nobody@example.com"),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
        assertThat(resp.body!!["error"]).isEqualTo("INVALID_CREDENTIALS")
    }

    // ---------------------------------------------------------------------------
    // Me
    // ---------------------------------------------------------------------------

    @Test
    fun `me returns 200 with valid access_token cookie`() {
        val cookie = registerAliceAndGetCookie()
        val resp = restTemplate.exchange(
            "/api/auth/me",
            HttpMethod.GET,
            HttpEntity<Void>(requestWithCookie(cookie)),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(resp.body!!["username"]).isEqualTo("alice")
        assertThat(resp.body!!["userId"]).isNotNull()
    }

    @Test
    fun `me returns 401 without cookie`() {
        val resp = restTemplate.getForEntity("/api/auth/me", Map::class.java)
        assertThat(resp.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    // ---------------------------------------------------------------------------
    // Logout
    // ---------------------------------------------------------------------------

    @Test
    fun `logout returns 200 and clears access_token cookie`() {
        val cookie = registerAliceAndGetCookie()
        val resp = restTemplate.exchange(
            "/api/auth/logout",
            HttpMethod.POST,
            HttpEntity<Void>(requestWithCookie(cookie)),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        val setCookieHeader = resp.headers["Set-Cookie"]?.firstOrNull { it.startsWith("access_token=") }
        assertThat(setCookieHeader).isNotNull()
        assertThat(setCookieHeader).containsIgnoringCase("max-age=0")
    }

    // ---------------------------------------------------------------------------
    // Refresh
    // ---------------------------------------------------------------------------

    @Test
    fun `refresh returns 200 and sets new access_token cookie`() {
        restTemplate.postForEntity("/api/auth/register", registerBody(), Map::class.java)
        val loginResp = restTemplate.postForEntity("/api/auth/login", loginBody(), Map::class.java)
        val refreshCookie = extractCookie(loginResp.headers, "refresh_token")
            ?: error("refresh_token cookie missing after login")

        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            add("Cookie", "refresh_token=$refreshCookie")
        }
        val resp = restTemplate.exchange(
            "/api/auth/refresh",
            HttpMethod.POST,
            HttpEntity<Void>(headers),
            Map::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(extractCookie(resp.headers, "access_token")).isNotBlank()
    }

    // ---------------------------------------------------------------------------
    // Sessions
    // ---------------------------------------------------------------------------

    @Test
    fun `sessions returns list with at least one entry marked current`() {
        val cookie = registerAliceAndGetCookie()
        val resp = restTemplate.exchange(
            "/api/auth/sessions",
            HttpMethod.GET,
            HttpEntity<Void>(requestWithCookie(cookie)),
            List::class.java
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.OK)
        val sessions = resp.body!!
        assertThat(sessions).isNotEmpty()
        @Suppress("UNCHECKED_CAST")
        val hasCurrent = (sessions as List<Map<String, Any>>).any { it["current"] == true }
        assertThat(hasCurrent).isTrue()
    }
}
