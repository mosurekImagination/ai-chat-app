package com.example.chat.dto

import java.util.UUID

data class UploadResponse(
    val attachmentId: UUID,
    val originalFilename: String,
    val mimeType: String,
    val sizeBytes: Long,
)
