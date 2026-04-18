package com.example.chat.config

import io.jsonwebtoken.Claims
import io.jsonwebtoken.JwtException
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Date

@Component
class JwtUtil(private val jwtProperties: JwtProperties) {

    private val key by lazy {
        Keys.hmacShaKeyFor(jwtProperties.secret.toByteArray(StandardCharsets.UTF_8))
    }

    fun generateAccessToken(userId: Long, sessionId: Long): Pair<String, Instant> {
        val expiry = Instant.now().plusSeconds(jwtProperties.accessTokenExpiryMinutes * 60)
        val token = Jwts.builder()
            .subject(userId.toString())
            .claim("sid", sessionId)
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(expiry))
            .signWith(key)
            .compact()
        return Pair(token, expiry)
    }

    fun getClaims(token: String): Claims? = try {
        Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .payload
    } catch (_: JwtException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }
}
