package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.exception.UnauthorizedException
import com.example.chat.domain.user.UserService
import com.example.chat.dto.AuthResponse
import com.example.chat.dto.LoginRequest
import com.example.chat.dto.RegisterRequest
import com.example.chat.dto.SessionResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/auth")
class AuthController(private val userService: UserService) {

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    fun register(
        @Valid @RequestBody req: RegisterRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AuthResponse = userService.register(req.email, req.username, req.password, request, response)

    @PostMapping("/login")
    fun login(
        @Valid @RequestBody req: LoginRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AuthResponse = userService.login(req.email, req.password, req.keepSignedIn, request, response)

    @PostMapping("/logout")
    fun logout(authentication: Authentication, response: HttpServletResponse) {
        val principal = authentication.principal as? ChatPrincipal
            ?: throw UnauthorizedException("INVALID_CREDENTIALS")
        userService.logout(principal.sessionId, response)
    }

    @PostMapping("/refresh")
    fun refresh(request: HttpServletRequest, response: HttpServletResponse): AuthResponse {
        val rawToken = request.cookies?.firstOrNull { it.name == "refresh_token" }?.value
            ?: throw UnauthorizedException("INVALID_CREDENTIALS")
        return userService.refresh(rawToken, response)
    }

    @GetMapping("/me")
    fun me(authentication: Authentication): Map<String, Any> {
        val principal = authentication.principal as ChatPrincipal
        val user = userService.me(principal.userId)
        return mapOf("userId" to user.id, "username" to user.username)
    }

    @GetMapping("/sessions")
    fun sessions(authentication: Authentication): List<SessionResponse> {
        val principal = authentication.principal as ChatPrincipal
        return userService.sessions(principal.userId, principal.sessionId)
    }
}
