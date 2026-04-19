package com.example.chat.api

import com.example.chat.domain.message.MessageRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.domain.user.PasswordResetTokenRepository
import com.example.chat.domain.user.SessionRepository
import com.example.chat.domain.user.UserRepository
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/api/admin")
class AdminController(
    private val sessionRepository: SessionRepository,
    private val passwordResetTokenRepository: PasswordResetTokenRepository,
    private val userRepository: UserRepository,
    private val roomRepository: RoomRepository,
    private val messageRepository: MessageRepository,
) {
    @GetMapping("/stats")
    fun stats(): ResponseEntity<Map<String, Long>> {
        val now = Instant.now()
        return ResponseEntity.ok(mapOf(
            "expiredSessions" to sessionRepository.countByExpiresAtBefore(now),
            "stalePasswordTokens" to passwordResetTokenRepository.countByExpiresAtBeforeOrUsedAtIsNotNull(now),
            "totalUsers" to userRepository.count(),
            "totalRooms" to roomRepository.count(),
            "totalMessages" to messageRepository.count(),
        ))
    }
}
