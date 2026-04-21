# api/urls.py
from django.urls import path, include
from rest_framework_nested import routers
from .views import MessageViewSet, ShuntViewSet, TVCViewSet, CalibrationSessionViewSet, TestPointViewSet, discover_instruments, system_info, BugReportViewSet

router = routers.SimpleRouter()
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'calibration_sessions', CalibrationSessionViewSet, basename='calibrationsession')
router.register(r'shunts', ShuntViewSet, basename='shunt')
router.register(r'tvcs', TVCViewSet, basename='tvc')
router.register(r'bug_reports', BugReportViewSet, basename='bugreport')

test_point_router = routers.NestedSimpleRouter(router, r'calibration_sessions', lookup='session')
test_point_router.register(r'test_points', TestPointViewSet, basename='session-test-point')

urlpatterns = [
    path('calibration_sessions/<int:session_pk>/test_points/<int:pk>/clear_readings/',
         TestPointViewSet.as_view({'post': 'clear_readings'}),
         name='testpoint-clear-readings'),
    

    path('system_info/', system_info, name='system_info'),
    
    path('', include(router.urls)),
    path('', include(test_point_router.urls)),
    path('instruments/discover/', discover_instruments, name='discover-instruments'),
]