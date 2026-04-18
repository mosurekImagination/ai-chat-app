package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository

interface RoomBanRepository : JpaRepository<RoomBan, Long> {
    fun existsByRoomIdAndUserId(roomId: Long, userId: Long): Boolean
}
