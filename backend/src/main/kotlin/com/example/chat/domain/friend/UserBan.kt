package com.example.chat.domain.friend

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "user_bans")
class UserBan(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "banner_id", nullable = false)
    val bannerId: Long,

    @Column(name = "banned_id", nullable = false)
    val bannedId: Long,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),
)
