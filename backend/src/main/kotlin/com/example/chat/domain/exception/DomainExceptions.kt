package com.example.chat.domain.exception

class ConflictException(val code: String) : RuntimeException(code)
class UnauthorizedException(val code: String) : RuntimeException(code)
class EntityNotFoundException(val code: String = "NOT_FOUND") : RuntimeException(code)
class ForbiddenException(val code: String = "FORBIDDEN") : RuntimeException(code)
