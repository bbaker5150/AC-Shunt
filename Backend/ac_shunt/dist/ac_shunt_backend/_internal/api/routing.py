# api/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/status/(?P<instrument_model>\w+)/(?P<gpib_address>.+)/$', consumers.InstrumentStatusConsumer.as_asgi()),
    re_path(r'^ws/collect-readings/(?P<session_id>\w+)/$', consumers.CalibrationConsumer.as_asgi()),
    re_path(r'^ws/switch/(?P<instrument_model>\w+)/(?P<gpib_address>.+)/$', consumers.SwitchDriverConsumer.as_asgi()),
]