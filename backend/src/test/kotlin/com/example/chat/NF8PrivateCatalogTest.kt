package com.example.chat

import com.example.chat.domain.room.RoomBanRepository
import com.example.chat.domain.room.RoomMemberRepository
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

class NF8PrivateCatalogTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var roomBanRepository: RoomBanRepository

    @AfterEach
    fun cleanup() {
        roomBanRepository.deleteAll()
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
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

    // ---------------------------------------------------------------------------
    // Private room catalog visibility
    // ---------------------------------------------------------------------------

    @Test
    fun `private room is not returned in the public catalog`() {
        val (ownerCookie, _) = register("owner@nf8.com", "ownernf8")
        val (otherCookie, _) = register("other@nf8.com", "othernf8")

        restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "secret-room", "visibility" to "PRIVATE"), headers(ownerCookie)),
            Map::class.java,
        )

        @Suppress("UNCHECKED_CAST")
        val catalog = restTemplate.exchange(
            "/api/rooms", HttpMethod.GET,
            HttpEntity<Void>(headers(otherCookie)), List::class.java,
        ).body as List<Map<*, *>>

        assertThat(catalog.none { it["name"] == "secret-room" }).isTrue()
    }

    @Test
    fun `non-member cannot GET details of a private room`() {
        val (ownerCookie, _) = register("powner@nf8.com", "pownernf8")
        val (guestCookie, _) = register("pguest@nf8.com", "pguestnf8")

        val roomId = (restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "invite-only-room", "visibility" to "PRIVATE"), headers(ownerCookie)),
            Map::class.java,
        ).body!!["id"] as Number).toLong()

        val resp = restTemplate.exchange(
            "/api/rooms/$roomId", HttpMethod.GET,
            HttpEntity<Void>(headers(guestCookie)), Map::class.java,
        )
        assertThat(resp.statusCode).isIn(HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND)
    }

    @Test
    fun `public room appears in catalog for all authenticated users`() {
        val (ownerCookie, _) = register("pubowner@nf8.com", "pubownernf8")
        val (otherCookie, _) = register("pubother@nf8.com", "pubothernf8")

        restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "public-visible-room", "visibility" to "PUBLIC"), headers(ownerCookie)),
            Map::class.java,
        )

        @Suppress("UNCHECKED_CAST")
        val catalog = restTemplate.exchange(
            "/api/rooms?q=public-visible-room", HttpMethod.GET,
            HttpEntity<Void>(headers(otherCookie)), List::class.java,
        ).body as List<Map<*, *>>

        assertThat(catalog.any { it["name"] == "public-visible-room" }).isTrue()
    }

    // ---------------------------------------------------------------------------
    // Unban → rejoin flow
    // ---------------------------------------------------------------------------

    @Test
    fun `banned user cannot rejoin but can after unban`() {
        val (ownerCookie, _) = register("rowner@nf8.com", "rownernf8")
        val (memberCookie, memberId) = register("rmember@nf8.com", "rmembernf8")

        // Owner creates public room
        val roomId = (restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "ban-test-room", "visibility" to "PUBLIC"), headers(ownerCookie)),
            Map::class.java,
        ).body!!["id"] as Number).toLong()

        // Member joins
        val joinResp = restTemplate.exchange(
            "/api/rooms/$roomId/join", HttpMethod.POST,
            HttpEntity<Void>(headers(memberCookie)), Map::class.java,
        )
        assertThat(joinResp.statusCode).isEqualTo(HttpStatus.CREATED)

        // Owner bans member
        val banResp = restTemplate.exchange(
            "/api/rooms/$roomId/bans", HttpMethod.POST,
            HttpEntity(mapOf("userId" to memberId), headers(ownerCookie)), Map::class.java,
        )
        assertThat(banResp.statusCode).isEqualTo(HttpStatus.CREATED)

        // Banned member cannot rejoin
        val rejoinBanned = restTemplate.exchange(
            "/api/rooms/$roomId/join", HttpMethod.POST,
            HttpEntity<Void>(headers(memberCookie)), Map::class.java,
        )
        assertThat(rejoinBanned.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(rejoinBanned.body!!["error"]).isEqualTo("ROOM_BANNED")

        // Owner unbans
        val unbanResp = restTemplate.exchange(
            "/api/rooms/$roomId/bans/$memberId", HttpMethod.DELETE,
            HttpEntity<Void>(headers(ownerCookie)), Void::class.java,
        )
        assertThat(unbanResp.statusCode).isEqualTo(HttpStatus.NO_CONTENT)

        // Previously banned member can now rejoin
        val rejoinAfterUnban = restTemplate.exchange(
            "/api/rooms/$roomId/join", HttpMethod.POST,
            HttpEntity<Void>(headers(memberCookie)), Map::class.java,
        )
        assertThat(rejoinAfterUnban.statusCode).isEqualTo(HttpStatus.CREATED)
    }

    @Test
    fun `banning a non-member still prevents them from joining`() {
        val (ownerCookie, _) = register("bowner@nf8.com", "bownernf8")
        val (targetCookie, targetId) = register("btarget@nf8.com", "btargetnf8")

        val roomId = (restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "preemptive-ban-room", "visibility" to "PUBLIC"), headers(ownerCookie)),
            Map::class.java,
        ).body!!["id"] as Number).toLong()

        // Ban without ever joining
        restTemplate.exchange(
            "/api/rooms/$roomId/bans", HttpMethod.POST,
            HttpEntity(mapOf("userId" to targetId), headers(ownerCookie)), Map::class.java,
        )

        val joinResp = restTemplate.exchange(
            "/api/rooms/$roomId/join", HttpMethod.POST,
            HttpEntity<Void>(headers(targetCookie)), Map::class.java,
        )
        assertThat(joinResp.statusCode).isEqualTo(HttpStatus.FORBIDDEN)
        assertThat(joinResp.body!!["error"]).isEqualTo("ROOM_BANNED")
    }
}
