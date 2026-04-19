package com.example.chat.api

import com.example.chat.domain.message.Message
import com.example.chat.domain.message.MessageRepository
import com.example.chat.domain.room.RoomMember
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.domain.user.UserRepository
import org.springframework.context.annotation.Profile
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Instant
import java.time.temporal.ChronoUnit

@Profile("local", "test")
@RestController
@RequestMapping("/api/dev")
class DevSeedController(
    private val messageRepository: MessageRepository,
    private val roomRepository: RoomRepository,
    private val roomMemberRepository: RoomMemberRepository,
    private val userRepository: UserRepository,
) {

    /**
     * Bulk-insert [count] messages into a room as a given user.
     * Creates membership if the user isn't already a member.
     * Only available in local and test profiles.
     */
    @PostMapping("/seed/rooms/{roomId}/messages")
    fun seedMessages(
        @PathVariable roomId: Long,
        @RequestParam(defaultValue = "1000") count: Int,
        @RequestParam userId: Long,
    ): ResponseEntity<Map<String, Any>> {
        val room = roomRepository.findById(roomId).orElseThrow { RuntimeException("room not found") }
        val user = userRepository.findById(userId).orElseThrow { RuntimeException("user not found") }

        // Ensure user is a member
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, user.id)) {
            roomMemberRepository.save(RoomMember(roomId = room.id, userId = user.id, role = "MEMBER"))
        }

        val now = Instant.now()
        val batchSize = 500
        var inserted = 0

        (0 until count).chunked(batchSize).forEach { batch ->
            val messages = batch.map { i ->
                Message(
                    roomId = roomId,
                    senderId = user.id,
                    content = "Seed message ${inserted + i + 1}",
                    createdAt = now.minus((count - inserted - i - 1).toLong(), ChronoUnit.SECONDS),
                )
            }
            messageRepository.saveAll(messages)
            inserted += batch.size
        }

        return ResponseEntity.ok(mapOf("inserted" to inserted, "roomId" to roomId))
    }
}
