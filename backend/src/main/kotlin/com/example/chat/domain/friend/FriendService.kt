package com.example.chat.domain.friend

import com.example.chat.domain.exception.ConflictException
import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.notification.NotificationService
import com.example.chat.domain.room.Room
import com.example.chat.domain.room.RoomBan
import com.example.chat.domain.room.RoomBanRepository
import com.example.chat.domain.room.RoomMember
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.domain.user.UserRepository
import com.example.chat.dto.FriendRequestResponse
import com.example.chat.dto.UserSummary
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class FriendService(
    private val friendshipRepository: FriendshipRepository,
    private val userBanRepository: UserBanRepository,
    private val userRepository: UserRepository,
    private val roomRepository: RoomRepository,
    private val roomMemberRepository: RoomMemberRepository,
    private val roomBanRepository: RoomBanRepository,
    private val notificationService: NotificationService,
) {

    @Transactional
    fun sendRequest(requesterId: Long, username: String, message: String?): FriendRequestResponse {
        val requester = userRepository.findById(requesterId).orElseThrow { EntityNotFoundException() }
        val addressee = userRepository.findByUsername(username).orElseThrow { EntityNotFoundException() }

        if (requesterId == addressee.id) throw ConflictException("ALREADY_FRIENDS")
        if (userBanRepository.existsBanEitherDirection(requesterId, addressee.id))
            throw ForbiddenException("FORBIDDEN")
        if (friendshipRepository.findAcceptedFriendIds(requesterId).contains(addressee.id))
            throw ConflictException("ALREADY_FRIENDS")

        val existing = friendshipRepository.findByRequesterIdAndAddresseeId(requesterId, addressee.id)
            ?: friendshipRepository.findByRequesterIdAndAddresseeId(addressee.id, requesterId)
        if (existing != null) throw ConflictException("FRIEND_REQUEST_EXISTS")

        val friendship = friendshipRepository.save(
            Friendship(requesterId = requesterId, addresseeId = addressee.id, message = message)
        )

        notificationService.push(
            addressee.id, "FRIEND_REQUEST",
            mapOf("requestId" to friendship.id, "fromUsername" to requester.username, "message" to message),
        )

        return toResponse(friendship, requester.id, requester.username, addressee.id, addressee.username)
    }

    fun listRequests(userId: Long): List<FriendRequestResponse> {
        val requests = friendshipRepository.findPendingForUser(userId)
        if (requests.isEmpty()) return emptyList()
        val userIds = requests.flatMap { listOf(it.requesterId, it.addresseeId) }.toSet()
        val usersById = userRepository.findAllById(userIds).associateBy { it.id }
        return requests.mapNotNull { f ->
            val req = usersById[f.requesterId] ?: return@mapNotNull null
            val addr = usersById[f.addresseeId] ?: return@mapNotNull null
            toResponse(f, req.id, req.username, addr.id, addr.username)
        }
    }

    @Transactional
    fun respondToRequest(requestId: Long, userId: Long, action: String): FriendRequestResponse {
        val friendship = friendshipRepository.findById(requestId).orElseThrow { EntityNotFoundException() }
        if (friendship.addresseeId != userId) throw ForbiddenException("FORBIDDEN")

        return when (action.uppercase()) {
            "ACCEPT" -> {
                friendship.status = "ACCEPTED"
                friendshipRepository.save(friendship)

                val dmRoomId = findOrCreateDmRoom(friendship.requesterId, friendship.addresseeId)

                val requester = userRepository.findById(friendship.requesterId).orElseThrow { EntityNotFoundException() }
                val addressee = userRepository.findById(friendship.addresseeId).orElseThrow { EntityNotFoundException() }

                notificationService.push(
                    friendship.requesterId, "FRIEND_ACCEPTED",
                    mapOf("friendUserId" to addressee.id, "friendUsername" to addressee.username),
                )

                toResponse(friendship, requester.id, requester.username, addressee.id, addressee.username, dmRoomId)
            }
            "REJECT" -> {
                val requester = userRepository.findById(friendship.requesterId).orElseThrow { EntityNotFoundException() }
                val addressee = userRepository.findById(friendship.addresseeId).orElseThrow { EntityNotFoundException() }
                val resp = toResponse(friendship, requester.id, requester.username, addressee.id, addressee.username)
                friendshipRepository.delete(friendship)
                resp
            }
            else -> throw com.example.chat.domain.exception.ValidationException("INVALID_REQUEST")
        }
    }

    @Transactional
    fun removeFriend(userId: Long, targetUserId: Long) {
        val friendship = friendshipRepository.findAcceptedPair(userId, targetUserId)
            ?: throw EntityNotFoundException()
        friendshipRepository.delete(friendship)
    }

    @Transactional
    fun banUser(bannerId: Long, bannedId: Long) {
        userRepository.findById(bannedId).orElseThrow { EntityNotFoundException() }
        if (userBanRepository.existsByBannerIdAndBannedId(bannerId, bannedId))
            throw ConflictException("ALREADY_BANNED")

        userBanRepository.save(UserBan(bannerId = bannerId, bannedId = bannedId))

        // Terminate friendship if exists
        val friendship = friendshipRepository.findAcceptedPair(bannerId, bannedId)
        if (friendship != null) friendshipRepository.delete(friendship)

        // If DM room exists, ban the banned user from it and send DM_BANNED notification
        val dmRoomId = roomMemberRepository.findDmRoomId(bannerId, bannedId)
        if (dmRoomId != null) {
            if (!roomBanRepository.existsByRoomIdAndUserId(dmRoomId, bannedId)) {
                roomBanRepository.save(RoomBan(roomId = dmRoomId, userId = bannedId, bannedById = bannerId))
            }
            notificationService.push(bannedId, "DM_BANNED", mapOf("roomId" to dmRoomId))
        }
    }

    @Transactional
    fun unbanUser(bannerId: Long, bannedId: Long) {
        val ban = userBanRepository.findByBannerIdAndBannedId(bannerId, bannedId)
            ?: throw EntityNotFoundException()
        userBanRepository.delete(ban)
    }

    private fun findOrCreateDmRoom(userId1: Long, userId2: Long): Long {
        val existing = roomMemberRepository.findDmRoomId(userId1, userId2)
        if (existing != null) return existing

        val room = roomRepository.save(Room(name = null, visibility = "DM"))
        roomMemberRepository.save(RoomMember(roomId = room.id, userId = userId1, role = "MEMBER"))
        roomMemberRepository.save(RoomMember(roomId = room.id, userId = userId2, role = "MEMBER"))
        return room.id
    }

    private fun toResponse(
        f: Friendship,
        requesterId: Long, requesterUsername: String,
        addresseeId: Long, addresseeUsername: String,
        dmRoomId: Long? = null,
    ) = FriendRequestResponse(
        id = f.id,
        requester = UserSummary(requesterId, requesterUsername),
        addressee = UserSummary(addresseeId, addresseeUsername),
        status = f.status,
        message = f.message,
        createdAt = f.createdAt.toString(),
        dmRoomId = dmRoomId,
    )
}
