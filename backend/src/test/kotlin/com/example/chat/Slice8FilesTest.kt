package com.example.chat

import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test

class Slice8FilesTest : AbstractIntegrationTest() {

    @Test
    @Disabled("Slice 8: implement — POST /api/rooms/{id}/files (multipart upload); Tika MIME validation from magic bytes (not Content-Type header); reject non-image/non-pdf with 415 UNSUPPORTED_MIME_TYPE; store at uploads/{roomId}/{uuid} (no original filename in path); GET /api/rooms/{id}/files/{fileId} returns file bytes with correct Content-Type; DELETE /api/rooms/{id}/files/{fileId} removes disk file then DB row; 10MB size limit → 413 FILE_TOO_LARGE.")
    fun `file upload MIME validation and download`() {
    }
}
