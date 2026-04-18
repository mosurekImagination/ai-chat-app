package com.example.chat.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/rooms")
class RoomController {

    // TODO: Slice 4 — full room CRUD + membership implementation
    @GetMapping
    fun listRooms(): List<Any> = emptyList()
}
