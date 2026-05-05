from starlette import status


class ApplicationError(Exception):
    def __init__(self, status_code: int, detail: str, code: str) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


class BadRequestError(ApplicationError):
    def __init__(self, detail: str, code: str = "bad_request") -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, detail, code)


class UnauthorizedError(ApplicationError):
    def __init__(self, detail: str, code: str = "unauthorized") -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail, code)


class ForbiddenError(ApplicationError):
    def __init__(self, detail: str, code: str = "forbidden") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail, code)


class NotFoundError(ApplicationError):
    def __init__(self, detail: str, code: str = "not_found") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, detail, code)


class ConflictError(ApplicationError):
    def __init__(self, detail: str, code: str = "conflict") -> None:
        super().__init__(status.HTTP_409_CONFLICT, detail, code)
