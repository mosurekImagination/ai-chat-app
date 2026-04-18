package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface RoomBanEntry {
    fun getUserId(): Long
    fun getUsername(): String
    fun getBannedById(): Long?
    fun getBannedByUsername(): String?
    fun getCreatedAt(): java.time.Instant
}

interface RoomBanRepository : JpaRepository<RoomBan, Long> {
    fun existsByRoomIdAndUserId(roomId: Long, userId: Long): Boolean
    fun findByRoomIdAndUserId(roomId: Long, userId: Long): RoomBan?
    fun deleteByRoomIdAndUserId(roomId: Long, userId: Long)

    @Query(value = """
        SELECT rb.user_id AS userId, u.username,
               rb.banned_by_id AS bannedById, bu.username AS bannedByUsername,
               rb.created_at AS createdAt
        FROM room_bans rb
        JOIN users u ON u.id = rb.user_id
        LEFT JOIN users bu ON bu.id = rb.banned_by_id
        WHERE rb.room_id = :roomId
    """, nativeQuery = true)
    fun findBansWithUsername(@Param("roomId") roomId: Long): List<RoomBanEntry>
}
