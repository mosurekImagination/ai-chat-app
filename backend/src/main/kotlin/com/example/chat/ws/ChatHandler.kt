package com.example.chat.ws

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.message.MessageService
import com.example.chat.dto.ChatDeleteCommand
import com.example.chat.dto.ChatEditCommand
import com.example.chat.dto.ChatSendCommand
import org.springframework.messaging.handler.annotation.MessageMapping
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Controller

@Controller
class ChatHandler(private val messageService: MessageService) {

    @MessageMapping("chat.send")
    fun send(cmd: ChatSendCommand, auth: Authentication) {
        val principal = auth.principal as ChatPrincipal
        messageService.sendMessage(cmd, principal.userId)
    }

    @MessageMapping("chat.edit")
    fun edit(cmd: ChatEditCommand, auth: Authentication) {
        val principal = auth.principal as ChatPrincipal
        messageService.editMessage(cmd, principal.userId)
    }

    @MessageMapping("chat.delete")
    fun delete(cmd: ChatDeleteCommand, auth: Authentication) {
        val principal = auth.principal as ChatPrincipal
        messageService.deleteMessage(cmd, principal.userId)
    }
}
