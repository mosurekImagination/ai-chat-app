package com.example.chat.domain.message

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface MessageRepository : JpaRepository<Message, Long> {

    // Two methods to avoid nullable parameter issues with PostgreSQL native queries.
    @Query(value = """
        SELECT m.id, m.room_id AS roomId, m.sender_id AS senderId, u.username AS senderUsername,
               m.content, m.parent_message_id AS parentMessageId,
               pm.sender_id AS parentSenderId, pu.username AS parentSenderUsername,
               pm.content AS parentContent,
               m.created_at AS createdAt, m.edited_at AS editedAt, m.deleted_at AS deletedAt
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN messages pm ON pm.id = m.parent_message_id
        LEFT JOIN users pu ON pu.id = pm.sender_id
        WHERE m.room_id = :roomId AND m.deleted_at IS NULL
        ORDER BY m.id DESC
        LIMIT :limit
    """, nativeQuery = true)
    fun findHistoryLatest(
        @Param("roomId") roomId: Long,
        @Param("limit") limit: Int,
    ): List<MessageHistoryProjection>

    @Query(value = """
        SELECT m.id, m.room_id AS roomId, m.sender_id AS senderId, u.username AS senderUsername,
               m.content, m.parent_message_id AS parentMessageId,
               pm.sender_id AS parentSenderId, pu.username AS parentSenderUsername,
               pm.content AS parentContent,
               m.created_at AS createdAt, m.edited_at AS editedAt, m.deleted_at AS deletedAt
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN messages pm ON pm.id = m.parent_message_id
        LEFT JOIN users pu ON pu.id = pm.sender_id
        WHERE m.room_id = :roomId AND m.deleted_at IS NULL AND m.id < :before
        ORDER BY m.id DESC
        LIMIT :limit
    """, nativeQuery = true)
    fun findHistoryBefore(
        @Param("roomId") roomId: Long,
        @Param("before") before: Long,
        @Param("limit") limit: Int,
    ): List<MessageHistoryProjection>

    @Query(value = """
        SELECT m.id, m.room_id AS roomId, m.sender_id AS senderId, u.username AS senderUsername,
               m.content, m.parent_message_id AS parentMessageId,
               pm.sender_id AS parentSenderId, pu.username AS parentSenderUsername,
               pm.content AS parentContent,
               m.created_at AS createdAt, m.edited_at AS editedAt, m.deleted_at AS deletedAt
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN messages pm ON pm.id = m.parent_message_id
        LEFT JOIN users pu ON pu.id = pm.sender_id
        WHERE m.id = :id
    """, nativeQuery = true)
    fun findWithDetails(@Param("id") id: Long): MessageHistoryProjection?
}
