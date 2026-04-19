package com.example.chat.domain.room

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "room_invitations")
class RoomInvitation(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "room_id", nullable = false)
    val roomId: Long,

    @Column(name = "user_id", nullable = false)
    val userId: Long,

    @Column(name = "invited_by_id")
    val invitedById: Long? = null,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),
)
