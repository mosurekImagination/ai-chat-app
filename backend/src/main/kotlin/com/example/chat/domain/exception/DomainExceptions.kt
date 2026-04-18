package com.example.chat.domain.exception

class ConflictException(val code: String) : RuntimeException(code)
class UnauthorizedException(val code: String) : RuntimeException(code)
class EntityNotFoundException(val code: String = "NOT_FOUND") : RuntimeException(code)
class ForbiddenException(val code: String = "FORBIDDEN") : RuntimeException(code)
class ValidationException(val code: String = "INVALID_REQUEST") : RuntimeException(code)
class FileSizeLimitException : RuntimeException("FILE_TOO_LARGE")
class UnsupportedMimeTypeException : RuntimeException("UNSUPPORTED_MIME_TYPE")
