package com.example.chat

import com.example.chat.domain.friend.FriendshipRepository
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
import org.springframework.http.MediaType
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// Req §3.6: system must preserve consistency of membership, room bans, and message history.
// These tests verify that concurrent operations do not corrupt shared state.
class NF11ConcurrencyTest : AbstractIntegrationTest() {

    @Autowired lateinit var restTemplate: TestRestTemplate
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var friendshipRepository: FriendshipRepository

    @AfterEach
    fun cleanup() {
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
        friendshipRepository.deleteAll()
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

    private fun sendFriendRequest(cookie: String, toUsername: String): Long {
        val resp = restTemplate.exchange(
            "/api/friends/requests", HttpMethod.POST,
            HttpEntity(mapOf("username" to toUsername), headers(cookie)), Map::class.java,
        )
        return (resp.body!!["id"] as Number).toLong()
    }

    private fun acceptRequest(cookie: String, requestId: Long) {
        restTemplate.exchange(
            "/api/friends/requests/$requestId", HttpMethod.PATCH,
            HttpEntity(mapOf("action" to "ACCEPT"), headers(cookie)), Map::class.java,
        )
    }

    @Test
    fun `accepting the same friend request from multiple threads creates exactly one DM room`() {
        val (aliceCookie, aliceId) = register("alice2@nf11.com", "alicenf11b")
        val (bobCookie, bobId) = register("bob2@nf11.com", "bobnf11b")

        val requestId = sendFriendRequest(aliceCookie, "bobnf11b")

        // Five concurrent accept calls from Bob on the same request ID
        val latch = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(5)
        val futures = (1..5).map {
            executor.submit { latch.await(); acceptRequest(bobCookie, requestId) }
        }
        latch.countDown()
        futures.forEach { it.get(10, TimeUnit.SECONDS) }
        executor.shutdown()

        // Still exactly one DM room
        val dmRooms = roomRepository.findAll().filter { it.visibility == "DM" }
            .filter { room ->
                roomMemberRepository.existsByRoomIdAndUserId(room.id, aliceId) &&
                roomMemberRepository.existsByRoomIdAndUserId(room.id, bobId)
            }
        assertThat(dmRooms).hasSize(1)

        // Friendship row count must also be one
        val friendships = friendshipRepository.findAll()
            .filter {
                (it.requesterId == aliceId && it.addresseeId == bobId) ||
                (it.requesterId == bobId && it.addresseeId == aliceId)
            }
        assertThat(friendships.count { it.status == "ACCEPTED" }).isEqualTo(1)
    }

    // ---------------------------------------------------------------------------
    // Concurrent room joins — membership consistency
    // ---------------------------------------------------------------------------

    @Test
    fun `multiple users joining the same public room concurrently all become members`() {
        val (ownerCookie, _) = register("owner@nf11.com", "ownernf11")
        val roomId = (restTemplate.exchange(
            "/api/rooms", HttpMethod.POST,
            HttpEntity(mapOf("name" to "concurrent-join-room", "visibility" to "PUBLIC"), headers(ownerCookie)),
            Map::class.java,
        ).body!!["id"] as Number).toLong()

        val userCount = 10
        val cookies = (1..userCount).map { i ->
            register("joiner$i@nf11.com", "joinernf11$i").first
        }

        val latch = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(userCount)
        val futures = cookies.map { cookie ->
            executor.submit {
                latch.await()
                restTemplate.exchange(
                    "/api/rooms/$roomId/join", HttpMethod.POST,
                    HttpEntity<Void>(headers(cookie)), Map::class.java,
                )
            }
        }
        latch.countDown()
        futures.forEach { it.get(10, TimeUnit.SECONDS) }
        executor.shutdown()

        // Owner + all joiners = userCount + 1 members
        val memberCount = roomMemberRepository.countByRoomId(roomId)
        assertThat(memberCount).isEqualTo((userCount + 1).toLong())
    }
}
