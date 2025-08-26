# api/urls.py
from django.urls import path, include
from rest_framework_nested import routers
from .views import MessageViewSet, CorrectionViewSet, CorrectionGroupedViewSet, UncertaintyViewSet, UncertaintyGroupedViewSet, CalibrationSessionViewSet, TestPointViewSet, discover_instruments

router = routers.SimpleRouter()
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'correction', CorrectionViewSet, basename='correction')
router.register(r'correction/grouped', CorrectionGroupedViewSet, basename='correction-grouped')
router.register(r'uncertainty', UncertaintyViewSet, basename='uncertainty')
router.register(r'uncertainty/grouped', UncertaintyGroupedViewSet, basename='uncertainty-grouped')
router.register(r'calibration_sessions', CalibrationSessionViewSet, basename='calibrationsession')

test_point_router = routers.NestedSimpleRouter(router, r'calibration_sessions', lookup='session')
test_point_router.register(r'test_points', TestPointViewSet, basename='session-test-point')

urlpatterns = [
    path('calibration_sessions/<int:session_pk>/test_points/<int:pk>/clear_readings/',
         TestPointViewSet.as_view({'post': 'clear_readings'}),
         name='testpoint-clear-readings'),
    
    # The router includes can now remain in their original order.
    path('', include(router.urls)),
    path('', include(test_point_router.urls)),
    
    path('instruments/discover/', discover_instruments, name='discover-instruments'),
]