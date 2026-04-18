package com.example.chat.domain.room

import java.time.Instant

interface RoomWithCountProjection {
    fun getId(): Long
    fun getName(): String
    fun getDescription(): String?
    fun getVisibility(): String
    fun getOwnerId(): Long?
    fun getCreatedAt(): Instant
    fun getMemberCount(): Long
}
