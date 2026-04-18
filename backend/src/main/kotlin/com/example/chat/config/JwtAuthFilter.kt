package com.example.chat.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class JwtAuthFilter(private val jwtUtil: JwtUtil) : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val token = request.cookies?.firstOrNull { it.name == "access_token" }?.value
        if (token != null) {
            val claims = jwtUtil.getClaims(token)
            if (claims != null) {
                val userId = claims.subject.toLongOrNull()
                val sessionId = claims["sid"].toString().toLongOrNull()
                if (userId != null && sessionId != null) {
                    val principal = ChatPrincipal(userId, sessionId)
                    val auth = UsernamePasswordAuthenticationToken(principal, null, emptyList())
                    SecurityContextHolder.getContext().authentication = auth
                }
            }
        }
        filterChain.doFilter(request, response)
    }
}
