# api/urls.py
from django.urls import path, include
from rest_framework_nested import routers
from .views import MessageViewSet, CalibrationSessionViewSet, TestPointViewSet, discover_instruments

router = routers.SimpleRouter()
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'calibration_sessions', CalibrationSessionViewSet, basename='calibrationsession')

test_point_router = routers.NestedSimpleRouter(router, r'calibration_sessions', lookup='session')
test_point_router.register(r'test_points', TestPointViewSet, basename='session-test-point')

urlpatterns = [
    path('', include(router.urls)),
    path('', include(test_point_router.urls)),
    path('instruments/discover/', discover_instruments, name='discover-instruments'),
]