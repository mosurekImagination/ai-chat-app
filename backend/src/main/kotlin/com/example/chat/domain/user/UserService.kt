package com.example.chat.domain.user

import com.example.chat.config.JwtProperties
import com.example.chat.config.JwtUtil
import com.example.chat.domain.exception.ConflictException
import com.example.chat.domain.exception.UnauthorizedException
import com.example.chat.dto.AuthResponse
import com.example.chat.dto.SessionResponse
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64

@Service
class UserService(
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
    private val passwordEncoder: PasswordEncoder,
    private val jwtUtil: JwtUtil,
    private val jwtProperties: JwtProperties,
) {
    private val secureRandom = SecureRandom()

    @Transactional
    fun register(
        email: String,
        username: String,
        password: String,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AuthResponse {
        if (userRepository.existsByEmail(email)) throw ConflictException("DUPLICATE_EMAIL")
        if (userRepository.existsByUsername(username)) throw ConflictException("DUPLICATE_USERNAME")

        val user = userRepository.save(
            User(email = email, username = username, passwordHash = passwordEncoder.encode(password))
        )
        return createSessionAndSetCookies(user, keepSignedIn = false, request, response)
    }

    @Transactional
    fun login(
        email: String,
        password: String,
        keepSignedIn: Boolean,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AuthResponse {
        val user = userRepository.findByEmail(email)
            .orElseThrow { UnauthorizedException("INVALID_CREDENTIALS") }
        if (!passwordEncoder.matches(password, user.passwordHash))
            throw UnauthorizedException("INVALID_CREDENTIALS")
        return createSessionAndSetCookies(user, keepSignedIn, request, response)
    }

    @Transactional
    fun logout(sessionId: Long, response: HttpServletResponse) {
        sessionRepository.deleteById(sessionId)
        clearCookies(response)
    }

    @Transactional
    fun refresh(rawRefreshToken: String, response: HttpServletResponse): AuthResponse {
        val hash = sha256(rawRefreshToken)
        val session = sessionRepository.findByTokenHash(hash)
            ?: throw UnauthorizedException("INVALID_CREDENTIALS")
        if (session.expiresAt.isBefore(Instant.now())) {
            sessionRepository.delete(session)
            throw UnauthorizedException("INVALID_CREDENTIALS")
        }
        val user = userRepository.findById(session.userId)
            .orElseThrow { UnauthorizedException("INVALID_CREDENTIALS") }
        val (accessToken, accessExpiry) = jwtUtil.generateAccessToken(user.id, session.id)
        setAccessTokenCookie(response, accessToken)
        return AuthResponse(userId = user.id, username = user.username, accessTokenExpiresAt = accessExpiry.toString())
    }

    fun me(userId: Long): User = userRepository.findById(userId)
        .orElseThrow { UnauthorizedException("INVALID_CREDENTIALS") }

    fun sessions(userId: Long, currentSessionId: Long): List<SessionResponse> =
        sessionRepository.findAllByUserId(userId).map { s ->
            SessionResponse(
                id = s.id,
                browserInfo = s.browserInfo,
                ip = s.ip,
                createdAt = s.createdAt.toString(),
                current = s.id == currentSessionId,
            )
        }

    private fun createSessionAndSetCookies(
        user: User,
        keepSignedIn: Boolean,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AuthResponse {
        val rawRefreshToken = generateRawToken()
        val refreshTtlDays = if (keepSignedIn) jwtProperties.refreshTokenExpiryDaysKeepSignedIn else jwtProperties.refreshTokenExpiryDays

        val session = sessionRepository.save(
            Session(
                userId = user.id,
                tokenHash = sha256(rawRefreshToken),
                browserInfo = parseBrowserInfo(request.getHeader("User-Agent")),
                ip = request.getHeader("X-Real-IP") ?: request.remoteAddr,
                expiresAt = Instant.now().plusSeconds(refreshTtlDays * 86400),
            )
        )

        val (accessToken, accessExpiry) = jwtUtil.generateAccessToken(user.id, session.id)
        setAccessTokenCookie(response, accessToken)
        setRefreshTokenCookie(response, rawRefreshToken, refreshTtlDays * 86400)

        return AuthResponse(userId = user.id, username = user.username, accessTokenExpiresAt = accessExpiry.toString())
    }

    private fun generateRawToken(): String {
        val bytes = ByteArray(32).also { secureRandom.nextBytes(it) }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun sha256(input: String): String {
        val hash = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(hash)
    }

    private fun parseBrowserInfo(userAgent: String?): String? {
        if (userAgent == null) return null
        return when {
            "Edge" in userAgent -> "Edge"
            "Chrome" in userAgent -> "Chrome"
            "Firefox" in userAgent -> "Firefox"
            "Safari" in userAgent -> "Safari"
            else -> "Unknown"
        }
    }

    private fun setAccessTokenCookie(response: HttpServletResponse, token: String) {
        Cookie("access_token", token).apply {
            isHttpOnly = true
            secure = true
            path = "/"
            maxAge = (jwtProperties.accessTokenExpiryMinutes * 60).toInt()
            setAttribute("SameSite", "Lax")
        }.also { response.addCookie(it) }
    }

    private fun setRefreshTokenCookie(response: HttpServletResponse, token: String, maxAgeSecs: Long) {
        Cookie("refresh_token", token).apply {
            isHttpOnly = true
            secure = true
            path = "/api/auth/refresh"
            maxAge = maxAgeSecs.toInt()
            setAttribute("SameSite", "Lax")
        }.also { response.addCookie(it) }
    }

    private fun clearCookies(response: HttpServletResponse) {
        Cookie("access_token", "").apply {
            isHttpOnly = true; secure = true; path = "/"; maxAge = 0
            setAttribute("SameSite", "Lax")
        }.also { response.addCookie(it) }
        Cookie("refresh_token", "").apply {
            isHttpOnly = true; secure = true; path = "/api/auth/refresh"; maxAge = 0
            setAttribute("SameSite", "Lax")
        }.also { response.addCookie(it) }
    }
}
