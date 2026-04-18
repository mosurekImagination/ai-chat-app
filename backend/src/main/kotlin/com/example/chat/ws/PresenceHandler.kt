package com.example.chat.ws

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.presence.PresenceService
import org.springframework.context.event.EventListener
import org.springframework.messaging.handler.annotation.MessageMapping
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Controller
import org.springframework.web.socket.messaging.SessionConnectedEvent
import org.springframework.web.socket.messaging.SessionDisconnectEvent

@Controller
class PresenceHandler(private val presenceService: PresenceService) {

    @EventListener
    fun onConnected(event: SessionConnectedEvent) {
        val accessor = StompHeaderAccessor.wrap(event.message)
        val auth = accessor.user as? Authentication ?: return
        val principal = auth.principal as? ChatPrincipal ?: return
        presenceService.onConnect(principal.userId, accessor.sessionId ?: return)
    }

    @EventListener
    fun onDisconnect(event: SessionDisconnectEvent) {
        val accessor = StompHeaderAccessor.wrap(event.message)
        presenceService.onDisconnect(accessor.sessionId ?: return)
    }

    @MessageMapping("presence.activity")
    fun activity(auth: Authentication, accessor: StompHeaderAccessor) {
        val principal = auth.principal as ChatPrincipal
        presenceService.onActivity(principal.userId, accessor.sessionId ?: return)
    }

    @MessageMapping("presence.afk")
    fun afk(auth: Authentication, accessor: StompHeaderAccessor) {
        val principal = auth.principal as ChatPrincipal
        presenceService.onAfk(principal.userId, accessor.sessionId ?: return)
    }
}
