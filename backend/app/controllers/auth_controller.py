from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.core.dependencies import DbSession, get_current_user
from app.core.security import clear_session_cookie, set_session_cookie
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    LogoutResponse,
    PasswordChangeRequest,
    PasswordChangeResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    UserResponse,
)
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, session: DbSession) -> AuthResponse:
    auth_response, access_token = await AuthService(session).register(payload)
    set_session_cookie(response, access_token)
    return auth_response


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, session: DbSession) -> AuthResponse:
    auth_response, access_token = await AuthService(session).login(payload)
    set_session_cookie(response, access_token)
    return auth_response


@router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response) -> LogoutResponse:
    clear_session_cookie(response)
    return LogoutResponse()


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    payload: ProfileUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: DbSession,
) -> UserResponse:
    return await AuthService(session).update_profile(user, payload)


@router.post("/change-password", response_model=PasswordChangeResponse)
async def change_password(
    payload: PasswordChangeRequest,
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
    session: DbSession,
) -> PasswordChangeResponse:
    change_response, access_token = await AuthService(session).change_password(user, payload)
    set_session_cookie(response, access_token)
    return change_response
