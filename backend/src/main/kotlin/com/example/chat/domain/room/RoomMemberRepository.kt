package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface MyRoomProjection {
    fun getId(): Long
    fun getName(): String?
    fun getVisibility(): String
    fun getUnreadCount(): Long
}

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
    fun findAllByRoomId(roomId: Long): List<RoomMember>
    fun findAllByUserId(userId: Long): List<RoomMember>

    @Query(value = """
        SELECT r.id, r.name, r.visibility,
               COUNT(m.id) FILTER (
                   WHERE m.deleted_at IS NULL
                     AND m.id > COALESCE(rc.last_read_message_id, 0)
               ) AS unreadCount
        FROM room_members rm
        JOIN rooms r ON r.id = rm.room_id
        LEFT JOIN messages m ON m.room_id = r.id
        LEFT JOIN room_read_cursors rc ON rc.room_id = r.id AND rc.user_id = :userId
        WHERE rm.user_id = :userId
        GROUP BY r.id, r.name, r.visibility, rc.last_read_message_id
    """, nativeQuery = true)
    fun findMyRoomsWithUnread(@Param("userId") userId: Long): List<MyRoomProjection>

    // Native SQL JOIN to fetch members with usernames in one query — avoids N+1.
    @Query(value = """
        SELECT rm.user_id AS userId, u.username, rm.role, rm.joined_at AS joinedAt
        FROM room_members rm
        JOIN users u ON u.id = rm.user_id
        WHERE rm.room_id = :roomId
        ORDER BY rm.joined_at
    """, nativeQuery = true)
    fun findMembersWithUsername(@Param("roomId") roomId: Long): List<MemberWithUsernameProjection>

    @Query(value = """
        SELECT rm.room_id FROM room_members rm
        JOIN rooms r ON r.id = rm.room_id
        WHERE rm.user_id = :userId1
          AND r.visibility = 'DM'
          AND rm.room_id IN (
              SELECT room_id FROM room_members WHERE user_id = :userId2
          )
        LIMIT 1
    """, nativeQuery = true)
    fun findDmRoomId(@Param("userId1") userId1: Long, @Param("userId2") userId2: Long): Long?
}
