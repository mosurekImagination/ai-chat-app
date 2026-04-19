package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.message.MessageService
import com.example.chat.dto.MessageResponse
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/messages")
class MessageController(private val messageService: MessageService) {

    @GetMapping("/{roomId}")
    fun getHistory(
        @PathVariable roomId: Long,
        @RequestParam before: Long?,
        @RequestParam after: Long?,
        @RequestParam(defaultValue = "50") limit: Int,
        auth: Authentication,
    ): ResponseEntity<List<MessageResponse>> {
        val userId = (auth.principal as ChatPrincipal).userId
        return if (after != null)
            ResponseEntity.ok(messageService.getHistoryAfter(roomId, userId, after, limit))
        else
            ResponseEntity.ok(messageService.getHistory(roomId, userId, before, limit))
    }
}
