package com.example.chat.config

import java.security.Principal

// getName() returns userId.toString() so convertAndSendToUser(userId.toString(), ...) routes correctly.
data class ChatPrincipal(val userId: Long, val sessionId: Long) : Principal {
    override fun getName() = userId.toString()
}
