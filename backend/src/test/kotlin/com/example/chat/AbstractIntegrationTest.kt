package com.example.chat

import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.ResponseEntity
import org.springframework.messaging.converter.MappingJackson2MessageConverter
import org.springframework.messaging.simp.stomp.StompHeaders
import org.springframework.messaging.simp.stomp.StompSession
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.web.socket.client.standard.StandardWebSocketClient
import org.springframework.web.socket.messaging.WebSocketStompClient
import org.springframework.web.socket.sockjs.client.SockJsClient
import org.springframework.web.socket.sockjs.client.WebSocketTransport
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
abstract class AbstractIntegrationTest {

    @LocalServerPort
    protected var port: Int = 0

    companion object {
        // Manual start — do NOT add @Container here.
        // @Container + .apply { start() } causes a double-start: the companion object
        // initializer starts the container on port X, then TestcontainersExtension restarts
        // it on port Y, but @DynamicPropertySource already captured port X → connection refused.
        // The manual approach starts the container once per JVM and never stops it mid-suite.
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")
            .withDatabaseName("chat_test")
            .withUsername("chat")
            .withPassword("chat")
            .apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }

    // Connect to the running STOMP broker with an authenticated cookie.
    // Use this in Slice 3+ tests instead of reimplementing the setup.
    // Throws immediately on ERROR frame or transport failure — no silent 10s hang.
    fun connectStomp(authCookie: String): StompSession {
        val transports = listOf(WebSocketTransport(StandardWebSocketClient()))
        val client = WebSocketStompClient(SockJsClient(transports)).apply {
            messageConverter = MappingJackson2MessageConverter()
        }
        val headers = StompHeaders().apply { add("Cookie", "access_token=$authCookie") }
        val latch = CountDownLatch(1)
        val sessionRef = AtomicReference<StompSession>()
        val errorRef = AtomicReference<String>()
        client.connectAsync("ws://localhost:$port/ws", object : StompSessionHandlerAdapter() {
            override fun afterConnected(session: StompSession, connectedHeaders: StompHeaders) {
                sessionRef.set(session)
                latch.countDown()
            }
            override fun handleTransportError(session: StompSession, exception: Throwable) {
                errorRef.set(exception.message ?: "transport error")
                latch.countDown()
            }
            override fun handleException(
                session: StompSession,
                command: org.springframework.messaging.simp.stomp.StompCommand?,
                headers: StompHeaders,
                payload: ByteArray,
                exception: Throwable,
            ) {
                errorRef.set(exception.message ?: "stomp exception")
                latch.countDown()
            }
        }, headers)
        check(latch.await(10, TimeUnit.SECONDS)) { "STOMP connect timeout after 10s" }
        errorRef.get()?.let { error("STOMP connect failed: $it") }
        return sessionRef.get()!!
    }

    // Extract a named cookie value from a response — avoids duplicating substringAfter/Before parsing in every test.
    // Subclasses inject @Autowired lateinit var restTemplate: TestRestTemplate in their own class definition.
    fun extractAuthCookie(response: ResponseEntity<*>, name: String = "access_token"): String =
        response.headers["Set-Cookie"]
            ?.firstOrNull { it.startsWith("$name=") }
            ?.substringAfter("$name=")
            ?.substringBefore(";")
            ?: error("$name cookie not found in response")

    // Subclasses must clean up their own data in @AfterEach.
    // Do NOT use @Transactional rollback — it does not work in RANDOM_PORT tests:
    // the server runs on a separate thread; transactions commit before the test client
    // receives the response. Use explicit deleteAll() calls instead.
    //
    // Example:
    // @AfterEach
    // fun cleanup() {
    //     messageRepository.deleteAll()
    //     roomRepository.deleteAll()
    //     userRepository.deleteAll()
    // }
}
