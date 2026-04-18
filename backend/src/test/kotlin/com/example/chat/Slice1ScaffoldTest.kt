package com.example.chat

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpStatus

class Slice1ScaffoldTest : AbstractIntegrationTest() {

    @Autowired
    lateinit var restTemplate: TestRestTemplate

    @Test
    fun `actuator health returns UP`() {
        val response = restTemplate.getForEntity("/actuator/health", String::class.java)
        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.body).contains("UP")
    }

    @Test
    fun `flyway applied V001 migration - all tables exist`() {
        val tables = listOf(
            "users", "sessions", "password_reset_tokens", "friendships", "user_bans",
            "rooms", "room_members", "room_bans", "messages", "attachments", "room_read_cursors"
        )
        val jdbcUrl = postgres.jdbcUrl
        java.sql.DriverManager.getConnection(jdbcUrl, postgres.username, postgres.password).use { conn ->
            tables.forEach { table ->
                val rs = conn.metaData.getTables(null, "public", table, arrayOf("TABLE"))
                assertThat(rs.next()).withFailMessage("Table '$table' not found after Flyway migration").isTrue()
            }
        }
    }
}
