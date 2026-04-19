package com.example.chat.config

import io.github.bucket4j.Bandwidth
import io.github.bucket4j.Bucket
import io.github.bucket4j.Refill
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

@Component
class LoginRateLimiter(
    @Value("\${app.login-rate-limit:10}") private val maxAttempts: Long,
) {
    private val buckets = ConcurrentHashMap<String, Bucket>()

    // Returns true if the attempt is allowed (token consumed), false if rate-limited.
    fun tryConsume(ip: String): Boolean =
        buckets.computeIfAbsent(ip) { newBucket() }.tryConsume(1)

    // Exposed for testing — reset all buckets so tests don't bleed into each other.
    fun reset() = buckets.clear()

    private fun newBucket(): Bucket =
        Bucket.builder()
            .addLimit(Bandwidth.classic(maxAttempts, Refill.intervally(maxAttempts, Duration.ofSeconds(60))))
            .build()
}
