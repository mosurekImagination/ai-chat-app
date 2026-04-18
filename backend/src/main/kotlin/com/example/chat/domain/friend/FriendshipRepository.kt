package com.example.chat.domain.friend

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface FriendshipRepository : JpaRepository<Friendship, Long> {

    @Query(value = """
        SELECT CASE WHEN f.requester_id = :userId THEN f.addressee_id ELSE f.requester_id END
        FROM friendships f
        WHERE f.status = 'ACCEPTED' AND (f.requester_id = :userId OR f.addressee_id = :userId)
    """, nativeQuery = true)
    fun findAcceptedFriendIds(@Param("userId") userId: Long): List<Long>

    @Query(value = """
        SELECT f.requester_id, f.addressee_id, u1.username AS requesterUsername, u2.username AS addresseeUsername,
               f.id, f.status, f.message, f.created_at AS createdAt
        FROM friendships f
        JOIN users u1 ON u1.id = f.requester_id
        JOIN users u2 ON u2.id = f.addressee_id
        WHERE f.status = 'ACCEPTED' AND (f.requester_id = :userId OR f.addressee_id = :userId)
    """, nativeQuery = true)
    fun findAcceptedFriendsWithUsername(@Param("userId") userId: Long): List<FriendWithUsernameProjection>

    fun existsByRequesterIdAndAddresseeIdAndStatus(requesterId: Long, addresseeId: Long, status: String): Boolean
    fun findByRequesterIdAndAddresseeId(requesterId: Long, addresseeId: Long): Friendship?
}

interface FriendWithUsernameProjection {
    fun getRequesterId(): Long
    fun getAddresseeId(): Long
    fun getRequesterUsername(): String
    fun getAddresseeUsername(): String
    fun getId(): Long
    fun getStatus(): String
    fun getMessage(): String?
    fun getCreatedAt(): java.time.Instant
}
