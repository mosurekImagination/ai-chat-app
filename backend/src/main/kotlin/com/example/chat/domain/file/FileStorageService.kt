package com.example.chat.domain.file

import com.example.chat.domain.exception.FileSizeLimitException
import com.example.chat.domain.exception.UnsupportedMimeTypeException
import org.apache.tika.Tika
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.UUID

private val IMAGE_ALLOWLIST = setOf("image/jpeg", "image/png", "image/gif", "image/webp")
private const val IMAGE_MAX_BYTES = 3 * 1024 * 1024L   // 3 MB
private const val FILE_MAX_BYTES  = 20 * 1024 * 1024L  // 20 MB

@Service
class FileStorageService {

    @Value("\${app.uploads-dir}")
    private lateinit var uploadsDir: String

    private val tika = Tika()

    data class StoredFile(
        val uuid: UUID,
        val storagePath: String,  // "{roomId}/{uuid}"
        val mimeType: String,
        val sizeBytes: Long,
    )

    fun store(file: MultipartFile, roomId: Long): StoredFile {
        val bytes = file.bytes
        val detectedMime = tika.detect(bytes)

        val isImage = detectedMime.startsWith("image/")
        if (isImage) {
            if (detectedMime !in IMAGE_ALLOWLIST) throw UnsupportedMimeTypeException()
            if (bytes.size > IMAGE_MAX_BYTES) throw FileSizeLimitException()
        } else {
            if (bytes.size > FILE_MAX_BYTES) throw FileSizeLimitException()
        }

        val uuid = UUID.randomUUID()
        val dir = Paths.get(uploadsDir, roomId.toString())
        Files.createDirectories(dir)
        Files.write(dir.resolve(uuid.toString()), bytes)

        return StoredFile(
            uuid = uuid,
            storagePath = "$roomId/$uuid",
            mimeType = detectedMime,
            sizeBytes = bytes.size.toLong(),
        )
    }

    fun resolve(storagePath: String): Path = Paths.get(uploadsDir, storagePath)

    fun delete(storagePath: String) {
        Files.deleteIfExists(Paths.get(uploadsDir, storagePath))
    }

    fun deleteRoom(roomId: Long) {
        val dir = Paths.get(uploadsDir, roomId.toString())
        if (Files.exists(dir)) {
            Files.walk(dir)
                .sorted(Comparator.reverseOrder())
                .forEach(Files::delete)
        }
    }
}
