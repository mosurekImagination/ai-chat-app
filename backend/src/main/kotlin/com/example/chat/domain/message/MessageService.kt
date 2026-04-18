package com.example.chat.domain.message

import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.exception.ValidationException
import com.example.chat.domain.room.RoomBanRepository
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.dto.*
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class MessageService(
    private val messageRepository: MessageRepository,
    private val attachmentRepository: AttachmentRepository,
    private val roomRepository: RoomRepository,
    private val roomMemberRepository: RoomMemberRepository,
    private val roomBanRepository: RoomBanRepository,
    private val messagingTemplate: SimpMessagingTemplate,
) {

    @Transactional
    fun sendMessage(cmd: ChatSendCommand, userId: Long) {
        if (cmd.content.toByteArray(Charsets.UTF_8).size > 3072) throw ValidationException("INVALID_REQUEST")
        roomRepository.findById(cmd.roomId).orElseThrow { EntityNotFoundException() }
        if (roomBanRepository.existsByRoomIdAndUserId(cmd.roomId, userId)) throw ForbiddenException("ROOM_BANNED")
        if (!roomMemberRepository.existsByRoomIdAndUserId(cmd.roomId, userId)) throw ForbiddenException("NOT_MEMBER")

        val msg = messageRepository.save(
            Message(roomId = cmd.roomId, senderId = userId, content = cmd.content, parentMessageId = cmd.parentMessageId)
        )

        val projection = messageRepository.findWithDetails(msg.id)!!
        val response = toResponse(projection, cmd.tempId)
        messagingTemplate.convertAndSend("/topic/room.${cmd.roomId}", MessageEvent("NEW", response))
    }

    @Transactional
    fun editMessage(cmd: ChatEditCommand, userId: Long) {
        if (cmd.content.toByteArray(Charsets.UTF_8).size > 3072) throw ValidationException("INVALID_REQUEST")
        val msg = messageRepository.findById(cmd.messageId).orElseThrow { EntityNotFoundException() }
        if (msg.senderId != userId) throw ForbiddenException("FORBIDDEN")
        if (msg.deletedAt != null) throw ForbiddenException("FORBIDDEN")
        msg.content = cmd.content
        msg.editedAt = Instant.now()
        messageRepository.save(msg)

        val projection = messageRepository.findWithDetails(msg.id)!!
        val response = toResponse(projection)
        messagingTemplate.convertAndSend("/topic/room.${msg.roomId}", MessageEvent("EDITED", response))
    }

    @Transactional
    fun deleteMessage(cmd: ChatDeleteCommand, userId: Long) {
        val msg = messageRepository.findById(cmd.messageId).orElseThrow { EntityNotFoundException() }
        if (msg.senderId != userId) throw ForbiddenException("FORBIDDEN")
        if (msg.deletedAt != null) return
        msg.deletedAt = Instant.now()
        messageRepository.save(msg)

        val projection = messageRepository.findWithDetails(msg.id)!!
        val response = toResponse(projection)
        messagingTemplate.convertAndSend("/topic/room.${msg.roomId}", MessageEvent("DELETED", response))
    }

    fun getHistory(roomId: Long, userId: Long, before: Long?, limit: Int): List<MessageResponse> {
        roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (roomBanRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("ROOM_BANNED")
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("NOT_MEMBER")

        val clampedLimit = limit.coerceIn(1, 100)
        val rows = if (before != null)
            messageRepository.findHistoryBefore(roomId, before, clampedLimit)
        else
            messageRepository.findHistoryLatest(roomId, clampedLimit)

        return rows.map { toResponse(it) }
    }

    private fun toResponse(p: MessageHistoryProjection, tempId: String? = null): MessageResponse {
        val attachments = attachmentRepository.findAllByMessageIdIn(listOf(p.getId()))
            .map { AttachmentSummary(id = it.id, originalFilename = it.originalFilename, mimeType = it.mimeType, sizeBytes = it.sizeBytes, comment = it.comment) }

        val sender = if (p.getSenderId() != null && p.getSenderUsername() != null)
            UserSummary(p.getSenderId()!!, p.getSenderUsername()!!)
        else null

        val parentMessage = if (p.getParentMessageId() != null) {
            val parentSender = if (p.getParentSenderId() != null && p.getParentSenderUsername() != null)
                UserSummary(p.getParentSenderId()!!, p.getParentSenderUsername()!!)
            else null
            ParentMessageSummary(p.getParentMessageId()!!, parentSender, p.getParentContent())
        } else null

        return MessageResponse(
            id = p.getId(),
            roomId = p.getRoomId(),
            sender = sender,
            content = p.getContent(),
            parentMessage = parentMessage,
            attachments = attachments,
            createdAt = p.getCreatedAt().toString(),
            editedAt = p.getEditedAt()?.toString(),
            deleted = p.getDeletedAt() != null,
            tempId = tempId,
        )
    }
}
