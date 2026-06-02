"""
URL configuration for the Metrology Workbench project.

Each workbench module backend is mounted under its own ``/api/<module>/``
namespace. The AC-Shunt module (the ``api`` app) is additionally kept on the
legacy ``/api/`` prefix for backwards compatibility, so existing clients — the
frontend's ``API_BASE_URL`` (``http://<host>:8000/api``) — keep working
unchanged while new code can migrate to ``/api/ac-shunt/``.

Specific module prefixes are listed before the legacy ``/api/`` catch-all; the
resolver still backtracks across includes, but ordering keeps the intent clear.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),

    # AC-Shunt module — namespaced path (preferred going forward).
    path('api/ac-shunt/', include('api.urls')),
    # Per-module backends.
    path('api/uncertainty/', include('uncertainty.urls')),
    path('api/reports/', include('reports.urls')),

    # Back-compat legacy alias for the AC-Shunt API. Keep LAST so the
    # module-specific prefixes above take precedence.
    path('api/', include('api.urls')),
]
