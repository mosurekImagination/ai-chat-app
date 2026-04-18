package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface MemberWithUsernameProjection {
    fun getUserId(): Long
    fun getUsername(): String
    fun getRole(): String
    fun getJoinedAt(): java.time.Instant
}

interface RoomMemberRepository : JpaRepository<RoomMember, Long> {
    fun findByRoomIdAndUserId(roomId: Long, userId: Long): RoomMember?
    fun existsByRoomIdAndUserId(roomId: Long, userId: Long): Boolean
    fun deleteByRoomIdAndUserId(roomId: Long, userId: Long)
    fun countByRoomId(roomId: Long): Long

    // Native SQL JOIN to fetch members with usernames in one query — avoids N+1.
    @Query(value = """
        SELECT rm.user_id AS userId, u.username, rm.role, rm.joined_at AS joinedAt
        FROM room_members rm
        JOIN users u ON u.id = rm.user_id
        WHERE rm.room_id = :roomId
        ORDER BY rm.joined_at
    """, nativeQuery = true)
    fun findMembersWithUsername(@Param("roomId") roomId: Long): List<MemberWithUsernameProjection>
}
