package com.example.chat

import com.example.chat.domain.message.Attachment
import com.example.chat.domain.message.AttachmentRepository
import com.example.chat.domain.message.Message
import com.example.chat.domain.message.MessageRepository
import com.example.chat.domain.message.MessageService
import com.example.chat.domain.room.Room
import com.example.chat.domain.room.RoomBanRepository
import com.example.chat.domain.room.RoomMember
import com.example.chat.domain.room.RoomMemberRepository
import com.example.chat.domain.room.RoomRepository
import com.example.chat.domain.user.User
import com.example.chat.domain.user.UserRepository
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class NF5AttachmentBatchTest : AbstractIntegrationTest() {

    @Autowired lateinit var messageService: MessageService
    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var roomRepository: RoomRepository
    @Autowired lateinit var roomMemberRepository: RoomMemberRepository
    @Autowired lateinit var roomBanRepository: RoomBanRepository
    @Autowired lateinit var messageRepository: MessageRepository
    @Autowired lateinit var attachmentRepository: AttachmentRepository
    @Autowired lateinit var entityManagerFactory: EntityManagerFactory

    @AfterEach
    fun cleanup() {
        attachmentRepository.deleteAll()
        messageRepository.deleteAll()
        roomMemberRepository.deleteAll()
        roomRepository.deleteAll()
        userRepository.deleteAll()
    }

    @Test
    fun `getHistory batch-loads attachments — single attachment query for 50-message page`() {
        val user = userRepository.save(User(email = "nf5@example.com", username = "nf5user", passwordHash = "x"))
        val room = roomRepository.save(Room(name = "nf5-room", visibility = "PUBLIC", ownerId = user.id))
        roomMemberRepository.save(RoomMember(roomId = room.id, userId = user.id, role = "ADMIN"))

        // Create 50 messages each with one attachment
        repeat(50) { i ->
            val msg = messageRepository.save(Message(roomId = room.id, senderId = user.id, content = "msg $i"))
            attachmentRepository.save(
                Attachment(
                    messageId = msg.id,
                    storagePath = "nf5/${room.id}/${msg.id}.bin",
                    originalFilename = "file$i.txt",
                    mimeType = "text/plain",
                    sizeBytes = 100L,
                )
            )
        }

        val sf = entityManagerFactory.unwrap(SessionFactory::class.java)
        val stats = sf.statistics
        stats.isStatisticsEnabled = true
        stats.clear()

        val result = messageService.getHistory(room.id, user.id, null, 50)

        val prepareCount = stats.prepareStatementCount

        // Without batch fix: 50 messages × 1 attachment query each = 51+ statements.
        // With batch fix: messages query + attachments query + membership/ban/room checks = ≤ 8.
        assertThat(prepareCount)
            .`as`("N+1 detected: expected ≤ 8 prepared statements but got $prepareCount")
            .isLessThanOrEqualTo(8)

        assertThat(result).hasSize(50)
        result.forEach { msg ->
            assertThat(msg.attachments)
                .`as`("message ${msg.id} should have exactly 1 attachment")
                .hasSize(1)
        }
    }
}
