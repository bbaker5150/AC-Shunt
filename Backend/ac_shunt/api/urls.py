# api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MessageViewSet, CalibrationSessionViewSet, discover_instruments

router = DefaultRouter()
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'calibration_sessions', CalibrationSessionViewSet, basename='calibrationsession')

urlpatterns = [
    path('', include(router.urls)),
    path('instruments/discover/', discover_instruments, name='discover-instruments'),
]