package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface RoomReadCursorRepository : JpaRepository<RoomReadCursor, RoomReadCursorId> {

    @Modifying
    @Query(value = """
        INSERT INTO room_read_cursors (room_id, user_id, last_read_message_id, updated_at)
        VALUES (:roomId, :userId,
            (SELECT MAX(id) FROM messages WHERE room_id = :roomId AND deleted_at IS NULL),
            NOW())
        ON CONFLICT (room_id, user_id)
        DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = NOW()
    """, nativeQuery = true)
    fun upsertReadCursor(@Param("roomId") roomId: Long, @Param("userId") userId: Long)

    @Query(value = """
        SELECT COUNT(*) FROM messages
        WHERE room_id = :roomId
          AND deleted_at IS NULL
          AND sender_id != :userId
          AND id > COALESCE(
              (SELECT last_read_message_id FROM room_read_cursors
               WHERE room_id = :roomId AND user_id = :userId),
              0)
    """, nativeQuery = true)
    fun countUnread(@Param("roomId") roomId: Long, @Param("userId") userId: Long): Long
}
