package com.example.chat.config

import com.example.chat.ws.JwtChannelInterceptor
import com.example.chat.ws.JwtHandshakeInterceptor
import org.springframework.context.annotation.Configuration
import org.springframework.messaging.simp.config.ChannelRegistration
import org.springframework.messaging.simp.config.MessageBrokerRegistry
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker
import org.springframework.web.socket.config.annotation.StompEndpointRegistry
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer

@Configuration
@EnableWebSocketMessageBroker
class WebSocketConfig(
    private val jwtChannelInterceptor: JwtChannelInterceptor,
    private val jwtHandshakeInterceptor: JwtHandshakeInterceptor,
) : WebSocketMessageBrokerConfigurer {

    override fun registerStompEndpoints(registry: StompEndpointRegistry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .addInterceptors(jwtHandshakeInterceptor)
            .withSockJS()
    }

    override fun configureMessageBroker(registry: MessageBrokerRegistry) {
        // Client subscribes to /topic/... and /user/queue/...
        registry.enableSimpleBroker("/topic", "/queue")
        // Client sends to /app/...
        registry.setApplicationDestinationPrefixes("/app")
        // Prefix for user-targeted messages (convertAndSendToUser)
        registry.setUserDestinationPrefix("/user")
    }

    override fun configureClientInboundChannel(registration: ChannelRegistration) {
        // JwtChannelInterceptor validates JWT on CONNECT frame — NOT HandshakeInterceptor.
        // HandshakeInterceptor runs on HTTP upgrade and does NOT bind principal to the
        // SecurityContextHolder used by @MessageMapping threads in Spring Security 6.
        registration.interceptors(jwtChannelInterceptor)
    }
}
