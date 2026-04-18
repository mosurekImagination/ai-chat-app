package com.example.chat.domain.room

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "rooms")
class Room(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false)
    var name: String,

    @Column
    var description: String? = null,

    @Column(nullable = false)
    var visibility: String,

    @Column(name = "owner_id")
    var ownerId: Long? = null,

    @Column(name = "created_at", nullable = false)
    val createdAt: Instant = Instant.now(),
)
