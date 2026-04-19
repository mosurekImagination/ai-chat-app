package com.example.chat.api

import com.example.chat.config.ChatPrincipal
import com.example.chat.domain.room.RoomService
import com.example.chat.dto.BanUserInRoomRequest
import com.example.chat.dto.CreateRoomRequest
import com.example.chat.dto.InviteUserRequest
import com.example.chat.dto.MemberResponse
import com.example.chat.dto.MyRoomResponse
import com.example.chat.dto.RoomBanResponse
import com.example.chat.dto.RoomResponse
import com.example.chat.dto.UpdateMemberRoleRequest
import com.example.chat.dto.UpdateRoomRequest
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/rooms")
class RoomController(private val roomService: RoomService) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun createRoom(
        @Valid @RequestBody req: CreateRoomRequest,
        auth: Authentication,
    ): RoomResponse = roomService.createRoom(req, auth.principal<ChatPrincipal>().userId)

    @GetMapping
    fun listRooms(@RequestParam q: String?): List<RoomResponse> = roomService.listPublicRooms(q)

    @GetMapping("/me")
    fun myRooms(auth: Authentication): List<MyRoomResponse> =
        roomService.getMyRooms(auth.principal<ChatPrincipal>().userId)

    @GetMapping("/{id}")
    fun getRoom(@PathVariable id: Long): RoomResponse = roomService.getRoom(id)

    @PostMapping("/{id}/join")
    @ResponseStatus(HttpStatus.CREATED)
    fun joinRoom(@PathVariable id: Long, auth: Authentication) =
        roomService.joinRoom(id, auth.principal<ChatPrincipal>().userId)

    @DeleteMapping("/{id}/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun leaveRoom(@PathVariable id: Long, auth: Authentication) =
        roomService.leaveRoom(id, auth.principal<ChatPrincipal>().userId)

    @GetMapping("/{id}/members")
    fun listMembers(@PathVariable id: Long, auth: Authentication): List<MemberResponse> =
        roomService.listMembers(id, auth.principal<ChatPrincipal>().userId)

    @PatchMapping("/{id}")
    fun updateRoom(
        @PathVariable id: Long,
        @Valid @RequestBody req: UpdateRoomRequest,
        auth: Authentication,
    ): RoomResponse = roomService.updateRoom(id, req, auth.principal<ChatPrincipal>().userId)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteRoom(@PathVariable id: Long, auth: Authentication) =
        roomService.deleteRoom(id, auth.principal<ChatPrincipal>().userId)

    @GetMapping("/{id}/unread")
    fun getUnread(@PathVariable id: Long, auth: Authentication): Map<String, Long> =
        mapOf("unreadCount" to roomService.getUnreadCount(id, auth.principal<ChatPrincipal>().userId))

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun markRead(@PathVariable id: Long, auth: Authentication) =
        roomService.markRead(id, auth.principal<ChatPrincipal>().userId)

    @GetMapping("/{id}/bans")
    fun listBans(@PathVariable id: Long, auth: Authentication): List<RoomBanResponse> =
        roomService.listBans(id, auth.principal<ChatPrincipal>().userId)

    @PostMapping("/{id}/bans")
    @ResponseStatus(HttpStatus.CREATED)
    fun banUser(
        @PathVariable id: Long,
        @RequestBody req: BanUserInRoomRequest,
        auth: Authentication,
    ) = roomService.banUserFromRoom(id, req.userId, auth.principal<ChatPrincipal>().userId)

    @DeleteMapping("/{id}/bans/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun unbanUser(
        @PathVariable id: Long,
        @PathVariable userId: Long,
        auth: Authentication,
    ) = roomService.unbanUserFromRoom(id, userId, auth.principal<ChatPrincipal>().userId)

    @PatchMapping("/{id}/members/{userId}")
    fun updateMemberRole(
        @PathVariable id: Long,
        @PathVariable userId: Long,
        @Valid @RequestBody req: UpdateMemberRoleRequest,
        auth: Authentication,
    ): MemberResponse = roomService.updateMemberRole(id, userId, req.role, auth.principal<ChatPrincipal>().userId)

    @PostMapping("/{id}/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    fun inviteUser(
        @PathVariable id: Long,
        @Valid @RequestBody req: InviteUserRequest,
        auth: Authentication,
    ) = roomService.inviteUser(id, req.username, auth.principal<ChatPrincipal>().userId)
}

private fun <T> Authentication.principal(): T {
    @Suppress("UNCHECKED_CAST")
    return principal as T
}
