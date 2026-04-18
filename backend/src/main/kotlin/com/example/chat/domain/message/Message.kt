package com.example.chat.domain.message

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "messages")
class Message(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,
    val roomId: Long,
    var senderId: Long?,
    var content: String,
    val parentMessageId: Long? = null,
    val createdAt: Instant = Instant.now(),
    var editedAt: Instant? = null,
    var deletedAt: Instant? = null,
)
