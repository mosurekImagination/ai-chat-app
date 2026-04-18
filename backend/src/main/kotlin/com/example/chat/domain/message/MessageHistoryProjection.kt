package com.example.chat.domain.message

import java.time.Instant

interface MessageHistoryProjection {
    fun getId(): Long
    fun getRoomId(): Long
    fun getSenderId(): Long?
    fun getSenderUsername(): String?
    fun getContent(): String
    fun getParentMessageId(): Long?
    fun getParentSenderId(): Long?
    fun getParentSenderUsername(): String?
    fun getParentContent(): String?
    fun getCreatedAt(): Instant
    fun getEditedAt(): Instant?
    fun getDeletedAt(): Instant?
}
