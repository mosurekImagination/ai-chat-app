package com.example.chat

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

class NF7RoomDescriptionTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository

    @AfterEach
    fun cleanup() {
        roomRepository.deleteAll()
        userRepository.deleteAll()
    }

    private fun register(email: String, username: String): String {
        val resp = restTemplate.postForEntity(
            "/api/auth/register",
            mapOf("email" to email, "username" to username, "password" to "s3cr3tP@ss"),
            Map::class.java,
        )
        return extractAuthCookie(resp)
    }

    private fun headers(cookie: String) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        add("Cookie", "access_token=$cookie")
    }

    @Test
    fun `room created with description returns it in GET room detail`() {
        val cookie = register("alice@nf7.com", "alicenf7")
        val create = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "described-room", "description" to "Hello world", "visibility" to "PUBLIC"), headers(cookie)),
            Map::class.java,
        )
        assertThat(create.statusCode).isEqualTo(HttpStatus.CREATED)
        val roomId = (create.body!!["id"] as Number).toLong()

        val get = restTemplate.exchange(
            "/api/rooms/$roomId", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), Map::class.java,
        )
        assertThat(get.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(get.body!!["description"]).isEqualTo("Hello world")
    }

    @Test
    fun `room created without description has null description`() {
        val cookie = register("bob@nf7.com", "bobnf7")
        val create = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "no-desc-room", "visibility" to "PUBLIC"), headers(cookie)),
            Map::class.java,
        )
        assertThat(create.statusCode).isEqualTo(HttpStatus.CREATED)
        val roomId = (create.body!!["id"] as Number).toLong()

        val get = restTemplate.exchange(
            "/api/rooms/$roomId", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), Map::class.java,
        )
        assertThat(get.body!!["description"]).isNull()
    }

    @Test
    fun `description is visible in the public room catalog`() {
        val cookie = register("cat@nf7.com", "catnf7")
        restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "catalog-desc-room", "description" to "Find me in catalog", "visibility" to "PUBLIC"), headers(cookie)),
            Map::class.java,
        )

        @Suppress("UNCHECKED_CAST")
        val list = restTemplate.exchange(
            "/api/rooms?q=catalog-desc-room", HttpMethod.GET,
            HttpEntity<Void>(headers(cookie)), List::class.java,
        ).body as List<Map<*, *>>

        val room = list.first { it["name"] == "catalog-desc-room" }
        assertThat(room["description"]).isEqualTo("Find me in catalog")
    }

    @Test
    fun `PATCH room updates description`() {
        val cookie = register("dan@nf7.com", "dannf7")
        val roomId = (restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "patch-desc-room", "description" to "old desc", "visibility" to "PUBLIC"), headers(cookie)),
            Map::class.java,
        ).body!!["id"] as Number).toLong()

        val patch = restTemplate.exchange(
            "/api/rooms/$roomId", HttpMethod.PATCH,
            HttpEntity(mapOf("description" to "new desc"), headers(cookie)),
            Map::class.java,
        )
        assertThat(patch.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(patch.body!!["description"]).isEqualTo("new desc")
    }

    @Test
    fun `description over 256 chars returns 400`() {
        val cookie = register("frank@nf7.com", "franknf7")
        val longDesc = "x".repeat(257)
        val resp = restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "long-desc-room", "description" to longDesc, "visibility" to "PUBLIC"), headers(cookie)),
            Map::class.java,
        )
        assertThat(resp.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
    }
}
