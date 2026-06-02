# ac_shunt/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack # Or SessionMiddlewareStack, or just URLRouter

# Correctly import your api app's routing
from api import routing as api_routing # Assuming your app is named 'api'

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ac_shunt.settings')

django_asgi_app = get_asgi_application() # Handles HTTP

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack( # Or just URLRouter if no auth needed initially
        URLRouter(
            api_routing.websocket_urlpatterns # Use your imported WebSocket URL patterns
        )
    ),
})