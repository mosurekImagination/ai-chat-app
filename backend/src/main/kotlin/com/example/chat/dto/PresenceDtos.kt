package com.example.chat.dto

data class PresenceEvent(val userId: Long, val status: String)

data class FriendResponse(val userId: Long, val username: String, val presence: String, val dmRoomId: Long? = null)
