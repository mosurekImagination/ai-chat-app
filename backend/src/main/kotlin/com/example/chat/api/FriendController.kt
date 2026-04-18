package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.presence.PresenceService
import com.example.chat.dto.FriendResponse
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/friends")
class FriendController(private val presenceService: PresenceService) {

    @GetMapping
    fun listFriends(auth: Authentication): ResponseEntity<List<FriendResponse>> {
        val userId = (auth.principal as ChatPrincipal).userId
        return ResponseEntity.ok(presenceService.getFriendsWithPresence(userId))
    }
}
