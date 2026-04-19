package com.example.chat.domain.user

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant

interface PasswordResetTokenRepository : JpaRepository<PasswordResetToken, Long> {
    fun findByTokenHash(tokenHash: String): PasswordResetToken?

    @Modifying
    @Query("DELETE FROM PasswordResetToken t WHERE t.expiresAt < :now OR t.usedAt IS NOT NULL")
    fun deleteAllStale(now: Instant): Int

    fun countByExpiresAtBeforeOrUsedAtIsNotNull(expiresAt: Instant): Long
}
