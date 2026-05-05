import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.controllers.router import api_router
from app.core.config import settings
from app.core.exceptions import ApplicationError


logger = logging.getLogger(__name__)


def create_application() -> FastAPI:
    application = FastAPI(title=settings.app_name, version=settings.app_version, debug=settings.debug)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(ApplicationError)
    async def application_error_handler(_: Request, exception: ApplicationError) -> JSONResponse:
        return JSONResponse(
            status_code=exception.status_code,
            content={"code": exception.code, "detail": exception.detail},
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exception: Exception) -> JSONResponse:
        logger.error(
            "Unhandled application exception",
            exc_info=(type(exception), exception, exception.__traceback__),
        )
        return JSONResponse(
            status_code=500,
            content={
                "code": "internal_server_error",
                "detail": "На сервере произошла внутренняя ошибка. Попробуйте еще раз.",
            },
        )

    application.include_router(api_router, prefix=settings.api_prefix)

    return application


app = create_application()
