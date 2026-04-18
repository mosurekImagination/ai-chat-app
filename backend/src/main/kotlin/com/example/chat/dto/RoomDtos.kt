package com.example.chat.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class CreateRoomRequest(
    @field:NotBlank @field:Size(min = 1, max = 64)
    val name: String,

    @field:Size(max = 256)
    val description: String? = null,

    @field:NotBlank
    val visibility: String,
)

data class UpdateRoomRequest(
    @field:Size(min = 1, max = 64)
    val name: String? = null,

    @field:Size(max = 256)
    val description: String? = null,

    val visibility: String? = null,
)

data class RoomResponse(
    val id: Long,
    val name: String?,
    val description: String?,
    val visibility: String,
    val ownerId: Long?,
    val memberCount: Int,
    val unreadCount: Int,
    val createdAt: String,
)

data class MemberResponse(
    val userId: Long,
    val username: String,
    val role: String,
    val joinedAt: String,
)

data class MyRoomResponse(
    val id: Long,
    val name: String?,
    val visibility: String,
    val unreadCount: Int,
)
