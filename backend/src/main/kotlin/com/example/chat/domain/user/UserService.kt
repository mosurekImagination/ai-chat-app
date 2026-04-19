package com.example.chat.domain.user

import com.example.chat.config.JwtProperties
import com.example.chat.config.JwtUtil
import com.example.chat.domain.exception.ConflictException
import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.exception.UnauthorizedException
import com.example.chat.domain.exception.ValidationException
import com.example.chat.dto.AuthResponse
import com.example.chat.dto.SessionResponse
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
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
    private val passwordResetTokenRepository: PasswordResetTokenRepository,
    private val passwordEncoder: PasswordEncoder,
    private val jwtUtil: JwtUtil,
    private val jwtProperties: JwtProperties,
    private val mailSender: JavaMailSender,
) {
    private val secureRandom = SecureRandom()
    private val log = LoggerFactory.getLogger(UserService::class.java)

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
        // Preserve session-cookie vs persistent-cookie intent from the original login.
        // Sessions with TTL > 8 days were created with keepSignedIn = true.
        val keepSignedIn = session.expiresAt.isAfter(Instant.now().plusSeconds(8 * 86400))
        setAccessTokenCookie(response, accessToken, keepSignedIn)
        return AuthResponse(userId = user.id, username = user.username, accessTokenExpiresAt = accessExpiry.toString())
    }

    fun me(userId: Long): User = userRepository.findById(userId)
        .orElseThrow { UnauthorizedException("INVALID_CREDENTIALS") }

    @Transactional
    fun forgotPassword(email: String) {
        val user = userRepository.findByEmail(email).orElse(null)
        if (user == null) {
            log.info("Password reset requested for unknown email: $email")
            return  // Always return 200 — no enumeration
        }
        val rawToken = generateRawToken()
        passwordResetTokenRepository.save(
            PasswordResetToken(
                userId = user.id,
                tokenHash = sha256(rawToken),
                expiresAt = Instant.now().plusSeconds(15 * 60),
            )
        )
        try {
            val msg = SimpleMailMessage().apply {
                setTo(user.email)
                subject = "Password reset"
                text = "Reset your password: http://localhost:3000/reset-password?token=$rawToken"
            }
            mailSender.send(msg)
        } catch (e: Exception) {
            log.error("Failed to send password reset email to ${user.email}", e)
        }
    }

    @Transactional
    fun resetPassword(rawToken: String, newPassword: String) {
        val token = passwordResetTokenRepository.findByTokenHash(sha256(rawToken))
        if (token == null || token.expiresAt.isBefore(Instant.now()) || token.usedAt != null) {
            log.info("Password reset attempted with invalid/expired/used token")
            return  // Always return 200 — no enumeration
        }
        token.usedAt = Instant.now()
        passwordResetTokenRepository.save(token)
        val user = userRepository.findById(token.userId).orElse(null) ?: return
        user.passwordHash = passwordEncoder.encode(newPassword)
        userRepository.save(user)
    }

    @Transactional
    fun changePassword(userId: Long, currentPassword: String, newPassword: String) {
        val user = userRepository.findById(userId).orElseThrow { UnauthorizedException("INVALID_CREDENTIALS") }
        if (!passwordEncoder.matches(currentPassword, user.passwordHash))
            throw ValidationException("WRONG_CURRENT_PASSWORD")
        user.passwordHash = passwordEncoder.encode(newPassword)
        userRepository.save(user)
    }

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

    @Transactional
    fun revokeSession(sessionId: Long, requestingUserId: Long) {
        val session = sessionRepository.findById(sessionId).orElseThrow { EntityNotFoundException() }
        if (session.userId != requestingUserId) throw ForbiddenException("FORBIDDEN")
        sessionRepository.delete(session)
    }

    @Transactional
    fun deleteAccount(userId: Long, response: HttpServletResponse) {
        userRepository.deleteById(userId)
        clearCookies(response)
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
        setAccessTokenCookie(response, accessToken, keepSignedIn)
        setRefreshTokenCookie(response, rawRefreshToken, if (keepSignedIn) refreshTtlDays * 86400 else -1)

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

    // keepSignedIn = false → session cookie (maxAge = -1, cleared on browser close)
    // keepSignedIn = true  → persistent cookie (maxAge = TTL seconds)
    private fun setAccessTokenCookie(response: HttpServletResponse, token: String, keepSignedIn: Boolean = true) {
        Cookie("access_token", token).apply {
            isHttpOnly = true
            secure = true
            path = "/"
            maxAge = if (keepSignedIn) (jwtProperties.accessTokenExpiryMinutes * 60).toInt() else -1
            setAttribute("SameSite", "Lax")
        }.also { response.addCookie(it) }
    }

    private fun setRefreshTokenCookie(response: HttpServletResponse, token: String, maxAgeSecs: Long) {
        Cookie("refresh_token", token).apply {
            isHttpOnly = true
            secure = true
            path = "/api/auth/refresh"
            // maxAgeSecs = -1 signals a session cookie (no Expires header)
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
