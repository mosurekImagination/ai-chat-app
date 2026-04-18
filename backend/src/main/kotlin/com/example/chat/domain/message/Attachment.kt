package com.example.chat.domain.message

import jakarta.persistence.*
import java.util.UUID

@Entity
@Table(name = "attachments")
class Attachment(
    @Id val id: UUID = UUID.randomUUID(),
    val messageId: Long,
    val storagePath: String,
    val originalFilename: String,
    val mimeType: String,
    val sizeBytes: Long,
    val comment: String? = null,
)
