package com.example.chat.domain.message

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface AttachmentRepository : JpaRepository<Attachment, UUID> {
    fun findAllByMessageIdIn(messageIds: List<Long>): List<Attachment>
}
