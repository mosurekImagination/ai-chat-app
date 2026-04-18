package com.example.chat.domain.user

import org.springframework.data.jpa.repository.JpaRepository

interface SessionRepository : JpaRepository<Session, Long> {
    fun findAllByUserId(userId: Long): List<Session>
    fun findByTokenHash(tokenHash: String): Session?
}
