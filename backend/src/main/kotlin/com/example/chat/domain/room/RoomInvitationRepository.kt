package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository

interface RoomInvitationRepository : JpaRepository<RoomInvitation, Long> {
    fun existsByRoomIdAndUserId(roomId: Long, userId: Long): Boolean
    fun deleteByRoomIdAndUserId(roomId: Long, userId: Long)
}
