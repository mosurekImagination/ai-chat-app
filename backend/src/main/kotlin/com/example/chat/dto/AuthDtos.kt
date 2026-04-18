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

data class AuthResponse(
    val userId: Long,
    val username: String,
    val accessTokenExpiresAt: String,
)

data class SessionResponse(
    val id: Long,
    val browserInfo: String?,
    val ip: String?,
    val createdAt: String,
    val current: Boolean,
)

data class ForgotPasswordRequest(
    @field:NotBlank @field:Email
    val email: String,
)

data class ResetPasswordRequest(
    @field:NotBlank val token: String,
    @field:NotBlank @field:Size(min = 8) val newPassword: String,
)

data class ChangePasswordRequest(
    @field:NotBlank val currentPassword: String,
    @field:NotBlank @field:Size(min = 8) val newPassword: String,
)
