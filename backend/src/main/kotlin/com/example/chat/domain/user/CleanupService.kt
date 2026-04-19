package com.example.chat.domain.user

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class CleanupService(
    private val sessionRepository: SessionRepository,
    private val passwordResetTokenRepository: PasswordResetTokenRepository,
) {
    private val log = LoggerFactory.getLogger(CleanupService::class.java)

    // Runs daily at 3 AM UTC. Both operations are cheap full-table deletes on indexed columns.
    @Scheduled(cron = "0 0 3 * * ?")
    @Transactional
    fun purgeStaleData() {
        val now = Instant.now()
        val deletedSessions = sessionRepository.deleteAllExpired(now)
        val deletedTokens = passwordResetTokenRepository.deleteAllStale(now)
        log.info("Cleanup complete: removed $deletedSessions expired sessions, $deletedTokens stale password reset tokens")
    }
}
