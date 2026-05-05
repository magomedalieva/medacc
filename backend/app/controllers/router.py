from fastapi import APIRouter

from app.controllers.accreditation_controller import router as accreditation_router
from app.controllers.admin_clinical_case_controller import router as admin_clinical_case_router
from app.controllers.admin_content_controller import router as admin_content_router
from app.controllers.admin_import_controller import router as admin_import_router
from app.controllers.admin_osce_station_controller import router as admin_osce_station_router
from app.controllers.admin_question_controller import router as admin_question_router
from app.controllers.admin_student_controller import router as admin_student_router
from app.controllers.analytics_controller import router as analytics_router
from app.controllers.auth_controller import router as auth_router
from app.controllers.clinical_case_controller import router as clinical_case_router
from app.controllers.faculty_controller import router as faculty_router
from app.controllers.onboarding_controller import router as onboarding_router
from app.controllers.osce_controller import router as osce_router
from app.controllers.question_controller import router as question_router
from app.controllers.schedule_controller import router as schedule_router
from app.controllers.test_controller import router as test_router
from app.controllers.topic_controller import router as topic_router


api_router = APIRouter()
api_router.include_router(accreditation_router)
api_router.include_router(admin_clinical_case_router)
api_router.include_router(admin_content_router)
api_router.include_router(admin_import_router)
api_router.include_router(admin_osce_station_router)
api_router.include_router(admin_question_router)
api_router.include_router(admin_student_router)
api_router.include_router(analytics_router)
api_router.include_router(auth_router)
api_router.include_router(clinical_case_router)
api_router.include_router(faculty_router)
api_router.include_router(onboarding_router)
api_router.include_router(osce_router)
api_router.include_router(question_router)
api_router.include_router(schedule_router)
api_router.include_router(test_router)
api_router.include_router(topic_router)
