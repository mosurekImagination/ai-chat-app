package com.example.chat.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "jwt")
data class JwtProperties(
    val secret: String,
    val accessTokenExpiryMinutes: Long = 15,
    val refreshTokenExpiryDays: Long = 7,
    val refreshTokenExpiryDaysKeepSignedIn: Long = 30,
)
