package com.example.chat.domain.friend

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface UserBanRepository : JpaRepository<UserBan, Long> {
    fun existsByBannerIdAndBannedId(bannerId: Long, bannedId: Long): Boolean
    fun findByBannerIdAndBannedId(bannerId: Long, bannedId: Long): UserBan?
    fun deleteByBannerIdAndBannedId(bannerId: Long, bannedId: Long)

    // True if either user has banned the other
    @Query(value = """
        SELECT EXISTS (
            SELECT 1 FROM user_bans
            WHERE (banner_id = :a AND banned_id = :b)
               OR (banner_id = :b AND banned_id = :a)
        )
    """, nativeQuery = true)
    fun existsBanEitherDirection(@Param("a") a: Long, @Param("b") b: Long): Boolean
}
