package com.example.chat.domain.room

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface RoomRepository : JpaRepository<Room, Long> {
    fun existsByNameIgnoreCase(name: String): Boolean

    // Native SQL with interface projection — single round-trip, no N+1.
    // CONCAT('%', :q, '%') matches all rows when q is empty string.
    @Query(value = """
        SELECT r.id, r.name, r.description, r.visibility,
               r.owner_id AS ownerId, r.created_at AS createdAt,
               COUNT(rm.id) AS memberCount
        FROM rooms r
        LEFT JOIN room_members rm ON rm.room_id = r.id
        WHERE r.visibility = 'PUBLIC'
          AND r.name IS NOT NULL
          AND LOWER(r.name) LIKE LOWER(CONCAT('%', :q, '%'))
        GROUP BY r.id
        ORDER BY r.name
    """, nativeQuery = true)
    fun findPublicRoomsWithCount(@Param("q") q: String): List<RoomWithCountProjection>

    @Query(value = """
        SELECT r.id, r.name, r.description, r.visibility,
               r.owner_id AS ownerId, r.created_at AS createdAt,
               COUNT(rm.id) AS memberCount
        FROM rooms r
        LEFT JOIN room_members rm ON rm.room_id = r.id
        WHERE r.id = :id
        GROUP BY r.id
    """, nativeQuery = true)
    fun findByIdWithCount(@Param("id") id: Long): List<RoomWithCountProjection>
}
