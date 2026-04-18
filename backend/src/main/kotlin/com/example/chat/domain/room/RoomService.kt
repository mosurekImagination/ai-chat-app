package com.example.chat.domain.room

import com.example.chat.domain.exception.ConflictException
import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.exception.ValidationException
import com.example.chat.domain.file.FileStorageService
import com.example.chat.domain.message.AttachmentRepository
import com.example.chat.domain.notification.NotificationService
import com.example.chat.dto.BanUserInRoomRequest
import com.example.chat.dto.CreateRoomRequest
import com.example.chat.dto.MemberResponse
import com.example.chat.dto.RoomBanResponse
import com.example.chat.dto.RoomResponse
import com.example.chat.dto.UpdateRoomRequest
import com.example.chat.dto.UserSummary
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class RoomService(
    private val roomRepository: RoomRepository,
    private val roomMemberRepository: RoomMemberRepository,
    private val roomBanRepository: RoomBanRepository,
    private val notificationService: NotificationService,
    private val attachmentRepository: AttachmentRepository,
    private val fileStorageService: FileStorageService,
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
        if (room.visibility == "PRIVATE") throw ForbiddenException("INVITE_REQUIRED")
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

    private fun toResponse(p: RoomWithCountProjection) = RoomResponse(
        id = p.getId(),
        name = p.getName(),
        description = p.getDescription(),
        visibility = p.getVisibility(),
        ownerId = p.getOwnerId(),
        memberCount = p.getMemberCount().toInt(),
        unreadCount = 0, // TODO: Slice 10 — compute from room_read_cursors
        createdAt = p.getCreatedAt().toString(),
    )

    private fun toResponse(room: Room, memberCount: Int) = RoomResponse(
        id = room.id,
        name = room.name,
        description = room.description,
        visibility = room.visibility,
        ownerId = room.ownerId,
        memberCount = memberCount,
        unreadCount = 0, // TODO: Slice 10 — compute from room_read_cursors
        createdAt = room.createdAt.toString(),
    )
}
