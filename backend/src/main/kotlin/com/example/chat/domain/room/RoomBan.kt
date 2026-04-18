package com.example.chat.domain.room

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "room_bans")
class RoomBan(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "room_id", nullable = false)
    val roomId: Long,

    @Column(name = "user_id", nullable = false)
    val userId: Long,

    @Column(name = "banned_by_id")
    val bannedById: Long? = null,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),
)
