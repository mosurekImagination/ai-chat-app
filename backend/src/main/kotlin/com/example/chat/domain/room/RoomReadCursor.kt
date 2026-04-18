package com.example.chat.domain.room

import jakarta.persistence.Column
import jakarta.persistence.Embeddable
import jakarta.persistence.EmbeddedId
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.io.Serializable
import java.time.Instant

@Embeddable
data class RoomReadCursorId(
    @Column(name = "room_id") val roomId: Long = 0,
    @Column(name = "user_id") val userId: Long = 0,
) : Serializable

@Entity
@Table(name = "room_read_cursors")
class RoomReadCursor(
    @EmbeddedId val id: RoomReadCursorId,
    @Column(name = "last_read_message_id") var lastReadMessageId: Long? = null,
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)
