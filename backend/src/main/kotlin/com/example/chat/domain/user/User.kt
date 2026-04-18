package com.example.chat.domain.user

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "users")
class User(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(unique = true, nullable = false)
    val email: String,

    @Column(unique = true, nullable = false)
    val username: String,

    @Column(name = "password_hash", nullable = false)
    var passwordHash: String,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,
)
