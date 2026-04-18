package com.example.chat.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

// Example DTOs for Slice 2 auth endpoints.
// All field names must match api-definition.yaml exactly (camelCase).
// Validation annotations require spring-boot-starter-validation on the classpath.

data class RegisterRequest(
    @field:NotBlank @field:Email
    val email: String,

    @field:NotBlank @field:Size(min = 2, max = 32)
    val username: String,

    @field:NotBlank @field:Size(min = 8)
    val password: String,
)

data class LoginRequest(
    @field:NotBlank @field:Email
    val email: String,

    @field:NotBlank
    val password: String,

    val keepSignedIn: Boolean = false,
)

// Returned by POST /api/auth/register (201) and POST /api/auth/login (200).
// accessTokenExpiresAt must be an ISO-8601 UTC instant (e.g. "2026-04-18T10:15:00Z").
data class AuthResponse(
    val userId: Long,
    val username: String,
    val accessTokenExpiresAt: String,
)
