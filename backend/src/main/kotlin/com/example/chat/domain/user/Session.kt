package com.example.chat.domain.user

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "sessions")
class Session(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "user_id", nullable = false)
    val userId: Long,

    @Column(name = "token_hash", nullable = false)
    val tokenHash: String,

    @Column(name = "browser_info")
    val browserInfo: String?,

    @Column(name = "ip")
    val ip: String?,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "expires_at", nullable = false)
    val expiresAt: Instant,
)
