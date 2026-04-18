package com.example.chat.domain.friend

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "friendships")
class Friendship(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,
    val requesterId: Long,
    val addresseeId: Long,
    var status: String = "PENDING",
    val message: String? = null,
    val createdAt: Instant = Instant.now(),
)
