package com.example.chat.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class SendFriendRequestRequest(
    @field:NotBlank val username: String = "",
    @field:Size(max = 256) val message: String? = null,
)

data class RespondToFriendRequestRequest(
    @field:NotBlank val action: String = "",
)

data class FriendRequestResponse(
    val id: Long,
    val requester: UserSummary,
    val addressee: UserSummary,
    val status: String,
    val message: String?,
    val createdAt: String,
    val dmRoomId: Long? = null,
)

data class NotificationEvent(val type: String, val payload: Any)

data class RoomBanResponse(
    val userId: Long,
    val username: String,
    val bannedBy: UserSummary? = null,
    val createdAt: String,
)

data class BanUserInRoomRequest(val userId: Long = 0)
