package com.example.chat.ws

import com.example.chat.config.ChatPrincipal
import com.example.chat.config.JwtUtil
import org.springframework.messaging.Message
import org.springframework.messaging.MessageChannel
import org.springframework.messaging.MessageDeliveryException
import org.springframework.messaging.simp.stomp.StompCommand
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.messaging.support.ChannelInterceptor
import org.springframework.messaging.support.MessageHeaderAccessor
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.stereotype.Component

@Component
class JwtChannelInterceptor(private val jwtUtil: JwtUtil) : ChannelInterceptor {

    override fun preSend(message: Message<*>, channel: MessageChannel): Message<*> {
        val accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor::class.java)

        if (accessor?.command == StompCommand.CONNECT) {
            // Browser path: cookie captured by JwtHandshakeInterceptor during HTTP upgrade → session attrs
            // Test/programmatic path: cookie sent as STOMP CONNECT native header
            val token = accessor.sessionAttributes?.get("access_token") as? String
                ?: parseCookieHeader(accessor.getNativeHeader("Cookie")?.firstOrNull())
                ?: throw MessageDeliveryException(message, "Missing access_token cookie")

            val claims = jwtUtil.getClaims(token)
                ?: throw MessageDeliveryException(message, "Invalid JWT")

            val userId = claims.subject.toLongOrNull()
            val sessionId = claims["sid"].toString().toLongOrNull()
            if (userId == null || sessionId == null)
                throw MessageDeliveryException(message, "Invalid JWT claims")

            accessor.user = UsernamePasswordAuthenticationToken(
                ChatPrincipal(userId, sessionId), null, emptyList()
            )
        }

        return message
    }

    private fun parseCookieHeader(cookieHeader: String?): String? =
        cookieHeader?.split(";")
            ?.map { it.trim() }
            ?.firstOrNull { it.startsWith("access_token=") }
            ?.substringAfter("access_token=")
}
