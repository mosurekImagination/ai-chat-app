package com.example.chat.domain.presence

import com.example.chat.domain.friend.FriendshipRepository
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.user.UserRepository
import com.example.chat.dto.FriendResponse
import com.example.chat.dto.PresenceEvent
import org.springframework.beans.factory.annotation.Value
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@Service
class PresenceService(
    private val messagingTemplate: SimpMessagingTemplate,
    private val friendshipRepository: FriendshipRepository,
    private val userRepository: UserRepository,
    private val roomMemberRepository: RoomMemberRepository,
) {
    // userId → (stompSessionId → lastActivityAt)
    val presenceMap = ConcurrentHashMap<Long, ConcurrentHashMap<String, Instant>>()

    // stompSessionId → userId (for disconnect cleanup)
    val sessionToUser = ConcurrentHashMap<String, Long>()

    // last status pushed to friends — prevents duplicate pushes on AFK scan
    private val lastPushedStatus = ConcurrentHashMap<Long, String>()

    @Value("\${chat.presence.afk-timeout-seconds:60}")
    var afkTimeoutSeconds: Long = 60

    fun onConnect(userId: Long, sessionId: String) {
        val wasOffline = presenceMap[userId].isNullOrEmpty()
        presenceMap.getOrPut(userId) { ConcurrentHashMap() }[sessionId] = Instant.now()
        sessionToUser[sessionId] = userId
        if (wasOffline) {
            lastPushedStatus[userId] = "ONLINE"
            notifyFriends(userId, "ONLINE")
        }
    }

    fun onActivity(userId: Long, sessionId: String) {
        val sessions = presenceMap[userId] ?: return
        val wasAFK = computeStatus(sessions) == "AFK"
        sessions[sessionId] = Instant.now()
        if (wasAFK) {
            lastPushedStatus[userId] = "ONLINE"
            notifyFriends(userId, "ONLINE")
        }
    }

    fun onAfk(userId: Long, sessionId: String) {
        val sessions = presenceMap[userId] ?: return
        val wasOnline = computeStatus(sessions) == "ONLINE"
        // Mark this session as idle — far enough in the past to exceed AFK threshold
        sessions[sessionId] = Instant.EPOCH
        if (wasOnline && computeStatus(sessions) != "ONLINE") {
            lastPushedStatus[userId] = "AFK"
            notifyFriends(userId, "AFK")
        }
    }

    fun onDisconnect(sessionId: String) {
        val userId = sessionToUser.remove(sessionId) ?: return
        val sessions = presenceMap[userId] ?: return
        val statusBefore = computeStatus(sessions)
        sessions.remove(sessionId)

        if (sessions.isEmpty()) {
            presenceMap.remove(userId)
            lastPushedStatus.remove(userId)
            notifyFriends(userId, "OFFLINE")
        } else {
            val statusAfter = computeStatus(sessions)
            if (statusBefore != statusAfter) {
                lastPushedStatus[userId] = statusAfter
                notifyFriends(userId, statusAfter)
            }
        }
    }

    @Scheduled(fixedRate = 10_000)
    fun runAfkScan() {
        presenceMap.forEach { (userId, sessions) ->
            if (sessions.isNotEmpty() && computeStatus(sessions) == "AFK") {
                if (lastPushedStatus[userId] == "ONLINE") {
                    lastPushedStatus[userId] = "AFK"
                    notifyFriends(userId, "AFK")
                }
            }
        }
    }

    fun getStatus(userId: Long): String {
        val sessions = presenceMap[userId]
        return if (sessions.isNullOrEmpty()) "OFFLINE" else computeStatus(sessions)
    }

    fun getFriendsWithPresence(userId: Long): List<FriendResponse> {
        val friendIds = friendshipRepository.findAcceptedFriendIds(userId)
        if (friendIds.isEmpty()) return emptyList()
        val usersById = userRepository.findAllById(friendIds).associateBy { it.id }
        return friendIds.mapNotNull { friendId ->
            usersById[friendId]?.let {
                FriendResponse(
                    userId = friendId,
                    username = it.username,
                    presence = getStatus(friendId),
                    dmRoomId = roomMemberRepository.findDmRoomId(userId, friendId),
                )
            }
        }
    }

    private fun computeStatus(sessions: Map<String, Instant>): String {
        if (sessions.isEmpty()) return "OFFLINE"
        val threshold = Instant.now().minusSeconds(afkTimeoutSeconds)
        return if (sessions.values.any { it.isAfter(threshold) }) "ONLINE" else "AFK"
    }

    fun notifyFriends(userId: Long, status: String) {
        val event = PresenceEvent(userId, status)
        friendshipRepository.findAcceptedFriendIds(userId).forEach { friendId ->
            messagingTemplate.convertAndSendToUser(friendId.toString(), "/queue/presence", event)
        }
    }
}
