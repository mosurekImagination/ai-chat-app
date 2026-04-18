package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.friend.FriendService
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/users")
class UserController(private val friendService: FriendService) {

    @PostMapping("/{id}/ban")
    @ResponseStatus(HttpStatus.CREATED)
    fun banUser(@PathVariable id: Long, auth: Authentication) {
        val currentUserId = (auth.principal as ChatPrincipal).userId
        friendService.banUser(currentUserId, id)
    }

    @DeleteMapping("/{id}/ban")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun unbanUser(@PathVariable id: Long, auth: Authentication) {
        val currentUserId = (auth.principal as ChatPrincipal).userId
        friendService.unbanUser(currentUserId, id)
    }
}
