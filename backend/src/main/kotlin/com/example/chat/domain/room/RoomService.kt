package com.example.chat.domain.room

import com.example.chat.domain.exception.ConflictException
import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.exception.ValidationException
import com.example.chat.domain.file.FileStorageService
import com.example.chat.domain.message.AttachmentRepository
import com.example.chat.domain.notification.NotificationService
import com.example.chat.domain.user.UserRepository
import com.example.chat.dto.BanUserInRoomRequest
import com.example.chat.dto.CreateRoomRequest
import com.example.chat.dto.MemberResponse
import com.example.chat.dto.MyRoomResponse
import com.example.chat.dto.RoomBanResponse
import com.example.chat.dto.RoomEvent
import com.example.chat.dto.RoomResponse
import com.example.chat.dto.UpdateRoomRequest
import com.example.chat.dto.UserSummary
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

@Service
class RoomService(
    private val roomRepository: RoomRepository,
    private val roomMemberRepository: RoomMemberRepository,
    private val roomBanRepository: RoomBanRepository,
    private val roomInvitationRepository: RoomInvitationRepository,
    private val roomReadCursorRepository: RoomReadCursorRepository,
    private val notificationService: NotificationService,
    private val attachmentRepository: AttachmentRepository,
    private val fileStorageService: FileStorageService,
    private val userRepository: UserRepository,
    private val messagingTemplate: SimpMessagingTemplate,
) {

    @Transactional
    fun createRoom(req: CreateRoomRequest, userId: Long): RoomResponse {
        if (req.visibility == "DM") throw ValidationException("INVALID_REQUEST")
        if (roomRepository.existsByNameIgnoreCase(req.name)) throw ConflictException("DUPLICATE_ROOM_NAME")

        val room = roomRepository.save(
            Room(name = req.name, description = req.description, visibility = req.visibility, ownerId = userId)
        )
        roomMemberRepository.save(RoomMember(roomId = room.id, userId = userId, role = "ADMIN"))
        return toResponse(room, 1)
    }

    fun listPublicRooms(q: String?): List<RoomResponse> =
        roomRepository.findPublicRoomsWithCount(q ?: "").map { toResponse(it) }

    fun getRoom(roomId: Long): RoomResponse {
        val row = roomRepository.findByIdWithCount(roomId).firstOrNull() ?: throw EntityNotFoundException()
        return toResponse(row)
    }

    @Transactional
    fun joinRoom(roomId: Long, userId: Long) {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (roomBanRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("ROOM_BANNED")
        if (roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ConflictException("ALREADY_MEMBER")
        if (room.visibility == "PRIVATE") {
            if (!roomInvitationRepository.existsByRoomIdAndUserId(roomId, userId))
                throw ForbiddenException("INVITE_REQUIRED")
            roomInvitationRepository.deleteByRoomIdAndUserId(roomId, userId)
        }
        roomMemberRepository.save(RoomMember(roomId = roomId, userId = userId, role = "MEMBER"))
    }

    @Transactional
    fun leaveRoom(roomId: Long, userId: Long) {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (room.ownerId == userId) throw ForbiddenException("OWNER_CANNOT_LEAVE")
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("NOT_MEMBER")
        roomMemberRepository.deleteByRoomIdAndUserId(roomId, userId)
    }

    fun listMembers(roomId: Long, userId: Long): List<MemberResponse> {
        roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (roomBanRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("ROOM_BANNED")
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("NOT_MEMBER")
        return roomMemberRepository.findMembersWithUsername(roomId).map { m ->
            MemberResponse(
                userId = m.getUserId(),
                username = m.getUsername(),
                role = m.getRole(),
                joinedAt = m.getJoinedAt().toString(),
            )
        }
    }

    @Transactional
    fun updateRoom(roomId: Long, req: UpdateRoomRequest, userId: Long): RoomResponse {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (room.ownerId != userId) throw ForbiddenException("FORBIDDEN")
        if (room.visibility == "DM" && req.visibility != null) throw ValidationException("DM_VISIBILITY_IMMUTABLE")
        req.name?.let {
            if (!it.equals(room.name, ignoreCase = true) && roomRepository.existsByNameIgnoreCase(it))
                throw ConflictException("DUPLICATE_ROOM_NAME")
            room.name = it
        }
        req.description?.let { room.description = it }
        req.visibility?.let { room.visibility = it }
        val saved = roomRepository.save(room)
        val count = roomMemberRepository.countByRoomId(roomId)
        return toResponse(saved, count.toInt())
    }

    @Transactional
    fun deleteRoom(roomId: Long, userId: Long) {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (room.ownerId != userId) throw ForbiddenException("FORBIDDEN")
        // Delete files from disk before deleting room row (per Discovered Gotchas: disk first, DB second)
        attachmentRepository.findAllStoragePathsByRoomId(roomId).forEach { path ->
            fileStorageService.delete(path)
        }
        fileStorageService.deleteRoom(roomId)
        roomRepository.deleteById(roomId)
        // Send STOMP notification AFTER tx commits — triggered refetch must see the room gone
        val event = RoomEvent("DELETED", roomId)
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() {
                messagingTemplate.convertAndSend("/topic/room.$roomId", event)
            }
        })
    }

    fun getUnreadCount(roomId: Long, userId: Long): Long {
        roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("NOT_MEMBER")
        return roomReadCursorRepository.countUnread(roomId, userId)
    }

    @Transactional
    fun markRead(roomId: Long, userId: Long) {
        roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (!roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)) throw ForbiddenException("NOT_MEMBER")
        roomReadCursorRepository.upsertReadCursor(roomId, userId)
    }

    fun getMyRooms(userId: Long): List<MyRoomResponse> =
        roomMemberRepository.findMyRoomsWithUnread(userId).map { p ->
            MyRoomResponse(id = p.getId(), name = p.getName(), visibility = p.getVisibility(), unreadCount = p.getUnreadCount().toInt())
        }

    fun listBans(roomId: Long, requestingUserId: Long): List<RoomBanResponse> {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        val member = roomMemberRepository.findByRoomIdAndUserId(roomId, requestingUserId)
        if (member == null || member.role !in listOf("ADMIN")) {
            if (room.ownerId != requestingUserId) throw ForbiddenException("FORBIDDEN")
        }
        return roomBanRepository.findBansWithUsername(roomId).map { entry ->
            RoomBanResponse(
                userId = entry.getUserId(),
                username = entry.getUsername(),
                bannedBy = entry.getBannedById()?.let { id ->
                    entry.getBannedByUsername()?.let { uname -> UserSummary(id, uname) }
                },
                createdAt = entry.getCreatedAt().toString(),
            )
        }
    }

    @Transactional
    fun banUserFromRoom(roomId: Long, targetUserId: Long, requestingUserId: Long) {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (room.visibility == "DM") throw ForbiddenException("FORBIDDEN")
        if (room.ownerId == targetUserId) throw ForbiddenException("CANNOT_BAN_OWNER")
        val member = roomMemberRepository.findByRoomIdAndUserId(roomId, requestingUserId)
        if (member == null || member.role !in listOf("ADMIN")) {
            if (room.ownerId != requestingUserId) throw ForbiddenException("FORBIDDEN")
        }
        if (roomBanRepository.existsByRoomIdAndUserId(roomId, targetUserId))
            throw ConflictException("ALREADY_BANNED")

        roomMemberRepository.deleteByRoomIdAndUserId(roomId, targetUserId)
        roomBanRepository.save(RoomBan(roomId = roomId, userId = targetUserId, bannedById = requestingUserId))
        notificationService.push(targetUserId, "ROOM_BANNED", mapOf("roomId" to roomId))
    }

    @Transactional
    fun unbanUserFromRoom(roomId: Long, targetUserId: Long, requestingUserId: Long) {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        val member = roomMemberRepository.findByRoomIdAndUserId(roomId, requestingUserId)
        if (member == null || member.role !in listOf("ADMIN")) {
            if (room.ownerId != requestingUserId) throw ForbiddenException("FORBIDDEN")
        }
        val ban = roomBanRepository.findByRoomIdAndUserId(roomId, targetUserId)
            ?: throw EntityNotFoundException()
        roomBanRepository.delete(ban)
    }

    @Transactional
    fun updateMemberRole(roomId: Long, targetUserId: Long, role: String, requestingUserId: Long): MemberResponse {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        if (room.ownerId != requestingUserId) throw ForbiddenException("FORBIDDEN")
        if (room.ownerId == targetUserId) throw ForbiddenException("CANNOT_DEMOTE_OWNER")
        val member = roomMemberRepository.findByRoomIdAndUserId(roomId, targetUserId)
            ?: throw EntityNotFoundException()
        member.role = role
        val saved = roomMemberRepository.save(member)
        val user = userRepository.findById(targetUserId).orElseThrow { EntityNotFoundException() }
        return MemberResponse(saved.userId, user.username, saved.role, saved.joinedAt.toString())
    }

    @Transactional
    fun inviteUser(roomId: Long, username: String, invitingUserId: Long) {
        val room = roomRepository.findById(roomId).orElseThrow { EntityNotFoundException() }
        val requestingMember = roomMemberRepository.findByRoomIdAndUserId(roomId, invitingUserId)
        if (requestingMember == null || requestingMember.role !in listOf("ADMIN")) {
            if (room.ownerId != invitingUserId) throw ForbiddenException("FORBIDDEN")
        }
        val targetUser = userRepository.findByUsername(username).orElseThrow { EntityNotFoundException() }
        if (roomMemberRepository.existsByRoomIdAndUserId(roomId, targetUser.id)) throw ConflictException("ALREADY_MEMBER")
        if (!roomInvitationRepository.existsByRoomIdAndUserId(roomId, targetUser.id)) {
            roomInvitationRepository.save(RoomInvitation(roomId = roomId, userId = targetUser.id, invitedById = invitingUserId))
        }
        notificationService.push(targetUser.id, "INVITE", mapOf("roomId" to roomId, "roomName" to (room.name ?: ""), "invitedByUsername" to (userRepository.findById(invitingUserId).map { it.username }.orElse("unknown"))))
    }

    private fun toResponse(p: RoomWithCountProjection) = RoomResponse(
        id = p.getId(),
        name = p.getName(),
        description = p.getDescription(),
        visibility = p.getVisibility(),
        ownerId = p.getOwnerId(),
        memberCount = p.getMemberCount().toInt(),
        unreadCount = 0, // 0 for public catalog (no userId context)
        createdAt = p.getCreatedAt().toString(),
    )

    private fun toResponse(room: Room, memberCount: Int) = RoomResponse(
        id = room.id,
        name = room.name,
        description = room.description,
        visibility = room.visibility,
        ownerId = room.ownerId,
        memberCount = memberCount,
        unreadCount = 0, // 0 for public catalog (no userId context)
        createdAt = room.createdAt.toString(),
    )
}
