package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.friend.FriendService
import com.example.chat.domain.presence.PresenceService
import com.example.chat.dto.FriendRequestResponse
import com.example.chat.dto.FriendResponse
import com.example.chat.dto.RespondToFriendRequestRequest
import com.example.chat.dto.SendFriendRequestRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/friends")
class FriendController(
    private val presenceService: PresenceService,
    private val friendService: FriendService,
) {

    @GetMapping
    fun listFriends(auth: Authentication): ResponseEntity<List<FriendResponse>> {
        val userId = auth.principal<ChatPrincipal>().userId
        return ResponseEntity.ok(presenceService.getFriendsWithPresence(userId))
    }

    @GetMapping("/requests")
    fun listRequests(auth: Authentication): List<FriendRequestResponse> {
        val userId = auth.principal<ChatPrincipal>().userId
        return friendService.listRequests(userId)
    }

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    fun sendRequest(
        @Valid @RequestBody req: SendFriendRequestRequest,
        auth: Authentication,
    ): FriendRequestResponse {
        val userId = auth.principal<ChatPrincipal>().userId
        return friendService.sendRequest(userId, req.username, req.message)
    }

    @PatchMapping("/requests/{id}")
    fun respondToRequest(
        @PathVariable id: Long,
        @Valid @RequestBody req: RespondToFriendRequestRequest,
        auth: Authentication,
    ): FriendRequestResponse {
        val userId = auth.principal<ChatPrincipal>().userId
        return friendService.respondToRequest(id, userId, req.action)
    }

    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun removeFriend(@PathVariable userId: Long, auth: Authentication) {
        val currentUserId = auth.principal<ChatPrincipal>().userId
        friendService.removeFriend(currentUserId, userId)
    }
}

private fun <T> Authentication.principal(): T {
    @Suppress("UNCHECKED_CAST")
    return principal as T
}
