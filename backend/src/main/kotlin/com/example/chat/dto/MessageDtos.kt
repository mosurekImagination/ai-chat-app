package com.example.chat.dto

import java.util.UUID

data class UserSummary(val id: Long, val username: String)

data class AttachmentSummary(
    val id: UUID,
    val originalFilename: String,
    val mimeType: String,
    val sizeBytes: Long,
    val comment: String?,
)

data class ParentMessageSummary(
    val id: Long,
    val sender: UserSummary?,
    val content: String?,
)

data class MessageResponse(
    val id: Long,
    val roomId: Long,
    val sender: UserSummary?,
    val content: String,
    val parentMessage: ParentMessageSummary?,
    val attachments: List<AttachmentSummary>,
    val createdAt: String,
    val editedAt: String?,
    val deleted: Boolean,
    val tempId: String? = null,
)

data class MessageEvent(val type: String, val message: MessageResponse)
data class RoomEvent(val type: String, val roomId: Long)

// Inbound STOMP frames
data class ChatSendCommand(
    val roomId: Long = 0,
    val content: String = "",
    val parentMessageId: Long? = null,
    val attachmentId: UUID? = null,
    val tempId: String? = null,
)

data class ChatEditCommand(
    val messageId: Long = 0,
    val content: String = "",
)

data class ChatDeleteCommand(
    val messageId: Long = 0,
)
