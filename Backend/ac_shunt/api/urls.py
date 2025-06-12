# api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MessageViewSet, DMMMeasurementViewSet, MeasurementSetViewSet, CalibrationSessionViewSet

router = DefaultRouter()
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'dmm_measurements', DMMMeasurementViewSet, basename='dmmmeasurement')
router.register(r'measurement_sets', MeasurementSetViewSet, basename='measurementset')
router.register(r'calibration_sessions', CalibrationSessionViewSet, basename='calibrationsession')

urlpatterns = [
    path('', include(router.urls)),
]