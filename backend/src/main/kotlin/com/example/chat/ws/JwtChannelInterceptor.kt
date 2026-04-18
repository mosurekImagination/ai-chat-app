package com.example.chat.ws

import org.springframework.messaging.Message
import org.springframework.messaging.MessageChannel
import org.springframework.messaging.simp.stomp.StompCommand
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.messaging.support.ChannelInterceptor
import org.springframework.messaging.support.MessageHeaderAccessor
import org.springframework.stereotype.Component

@Component
class JwtChannelInterceptor : ChannelInterceptor {

    override fun preSend(message: Message<*>, channel: MessageChannel): Message<*> {
        val accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor::class.java)

        if (accessor?.command == StompCommand.CONNECT) {
            // TODO Slice 3: extract JWT from STOMP CONNECT headers (or from cookie via nativeHeaders),
            // validate, and set accessor.user = UsernamePasswordAuthenticationToken(...)
            // Throw MessageDeliveryException to reject the connection.
        }

        return message
    }
}
