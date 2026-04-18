package com.example.chat.domain.user

import org.springframework.data.jpa.repository.JpaRepository

interface PasswordResetTokenRepository : JpaRepository<PasswordResetToken, Long> {
    fun findByTokenHash(tokenHash: String): PasswordResetToken?
}
