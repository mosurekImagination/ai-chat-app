package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.file.FileStorageService
import com.example.chat.domain.friend.UserBanRepository
import com.example.chat.domain.message.AttachmentRepository
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.dto.UploadResponse
import org.springframework.core.io.InputStreamResource
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.UUID

@RestController
@RequestMapping("/api/files")
class FileController(
    private val fileStorageService: FileStorageService,
    private val attachmentRepository: AttachmentRepository,
    private val roomRepository: RoomRepository,
    private val roomMemberRepository: RoomMemberRepository,
    private val userBanRepository: UserBanRepository,
) {

    @PostMapping("/upload")
    @ResponseStatus(HttpStatus.CREATED)
    fun upload(
        @RequestParam("file") file: MultipartFile,
        @RequestParam("roomId") roomId: Long,
        @RequestParam("originalFilename", required = false) originalFilename: String?,
        @RequestParam("comment", required = false) comment: String?,
        auth: Authentication,
    ): UploadResponse {
        val userId = (auth.principal as ChatPrincipal).userId
        roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("FORBIDDEN")

        val filename = (originalFilename ?: file.originalFilename ?: "upload").ifBlank { "upload" }
        val stored = fileStorageService.store(file, roomId)

        val attachment = com.example.chat.domain.message.Attachment(
            id = stored.uuid,
            storagePath = stored.storagePath,
            originalFilename = filename,
            mimeType = stored.mimeType,
            sizeBytes = stored.sizeBytes,
            comment = comment,
        )
        attachmentRepository.save(attachment)

        return UploadResponse(
            attachmentId = stored.uuid,
            originalFilename = filename,
            mimeType = stored.mimeType,
            sizeBytes = stored.sizeBytes,
        )
    }

    @GetMapping("/{id}")
    fun download(@PathVariable id: UUID, auth: Authentication): ResponseEntity<InputStreamResource> {
        val userId = (auth.principal as ChatPrincipal).userId
        val attachment = attachmentRepository.findById(id).orElseThrow { throw EntityNotFoundException() }

        val roomId = attachment.storagePath.substringBefore("/").toLongOrNull()
            ?: throw EntityNotFoundException()

        val room = roomRepository.findById(roomId).orElse(null) ?: throw EntityNotFoundException()

        // Return 404 for any inaccessible resource (per spec: avoid existence leakage)
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw EntityNotFoundException()

        // For DM rooms, also check user-to-user bans
        if (room.visibility == "DM") {
            if (userBanRepository.existsBanEitherDirection(userId, userId)) throw EntityNotFoundException()
            val otherMemberId = roomMemberRepository.findMembersWithUsername(roomId)
                .firstOrNull { it.getUserId() != userId }?.getUserId()
            if (otherMemberId != null && userBanRepository.existsBanEitherDirection(userId, otherMemberId))
                throw EntityNotFoundException()
        }

        val path = fileStorageService.resolve(attachment.storagePath)
        if (!Files.exists(path)) throw EntityNotFoundException()

        val encodedName = URLEncoder.encode(attachment.originalFilename, StandardCharsets.UTF_8)
            .replace("+", "%20")
        val headers = HttpHeaders().apply {
            contentType = MediaType.parseMediaType(attachment.mimeType)
            set(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''$encodedName")
        }

        return ResponseEntity.ok()
            .headers(headers)
            .body(InputStreamResource(Files.newInputStream(path)))
    }
}
