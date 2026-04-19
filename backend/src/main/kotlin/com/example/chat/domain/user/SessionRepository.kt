package com.example.chat.domain.user

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.Instant

interface SessionRepository : JpaRepository<Session, Long> {
    fun findAllByUserId(userId: Long): List<Session>
    fun findByTokenHash(tokenHash: String): Session?

    @Modifying
    @Query("DELETE FROM Session s WHERE s.expiresAt < :now")
    fun deleteAllExpired(now: Instant): Int

    fun countByExpiresAtBefore(now: Instant): Long
}
