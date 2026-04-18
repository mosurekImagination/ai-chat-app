package com.example.chat.domain.room

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "room_members")
class RoomMember(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "room_id", nullable = false)
    val roomId: Long,

    @Column(name = "user_id", nullable = false)
    val userId: Long,

    @Column(nullable = false)
    var role: String,

    @Column(name = "joined_at", nullable = false)
    val joinedAt: Instant = Instant.now(),
)
