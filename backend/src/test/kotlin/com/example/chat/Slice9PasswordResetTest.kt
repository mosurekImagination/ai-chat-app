package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice9PasswordResetTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 9: implement — POST /api/auth/forgot-password sends reset email via MailHog (always returns 200, even for unknown email); POST /api/auth/reset-password {token, newPassword} finds bcrypt-hashed token in password_reset_tokens, validates expires_at > NOW() and used_at IS NULL, updates users.password_hash, sets used_at; expired or already-used token returns 200 (no enumeration); token TTL 15 minutes; also implement POST /api/auth/change-password for authenticated users.")
    fun `password reset flow and change password`() {
    }
}
