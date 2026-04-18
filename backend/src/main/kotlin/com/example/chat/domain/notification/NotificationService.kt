package com.example.chat.domain.notification

import com.example.chat.dto.NotificationEvent
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Service

@Service
class NotificationService(private val messagingTemplate: SimpMessagingTemplate) {

    fun push(userId: Long, type: String, payload: Any) {
        messagingTemplate.convertAndSendToUser(
            userId.toString(), "/queue/notifications",
            NotificationEvent(type, payload),
        )
    }
}
