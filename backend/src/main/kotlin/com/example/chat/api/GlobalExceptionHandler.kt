package com.example.chat.api

import com.example.chat.domain.exception.ConflictException
import com.example.chat.domain.exception.EntityNotFoundException
import com.example.chat.domain.exception.ForbiddenException
import com.example.chat.domain.exception.UnauthorizedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(e: MethodArgumentNotValidException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to "INVALID_REQUEST"))

    @ExceptionHandler(ConflictException::class)
    fun handleConflict(e: ConflictException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to e.code))

    @ExceptionHandler(UnauthorizedException::class)
    fun handleUnauthorized(e: UnauthorizedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to e.code))

    @ExceptionHandler(EntityNotFoundException::class)
    fun handleNotFound(e: EntityNotFoundException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to e.code))

    @ExceptionHandler(ForbiddenException::class)
    fun handleForbidden(e: ForbiddenException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to e.code))

    @ExceptionHandler(Exception::class)
    fun handleGeneral(e: Exception): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to "INTERNAL_ERROR"))
}
