# api/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/status/(?P<instrument_model>\w+)/(?P<gpib_address>.+)/$', consumers.InstrumentStatusConsumer.as_asgi()),
    re_path(r'ws/dmm_live/(?P<gpib_address>.+)/$', consumers.DMMConsumer.as_asgi()),
    re_path(r'ws/status/fluke5730a/$', consumers.Status5730Consumer.as_asgi()),
]