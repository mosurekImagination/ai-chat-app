package com.example.chat.domain.message

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface AttachmentRepository : JpaRepository<Attachment, UUID> {
    fun findAllByMessageIdIn(messageIds: List<Long>): List<Attachment>
    fun findAllByMessageId(messageId: Long): List<Attachment>

    // For room deletion: find all storage paths so files can be deleted from disk first.
    @Query(value = "SELECT a.storage_path FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.room_id = :roomId", nativeQuery = true)
    fun findAllStoragePathsByRoomId(@Param("roomId") roomId: Long): List<String>

    // For unlinked attachments (message_id IS NULL): find by UUID only.
    // Used to link an attachment to a message after it's created.
    fun findByIdAndMessageIdIsNull(id: UUID): Attachment?
}
