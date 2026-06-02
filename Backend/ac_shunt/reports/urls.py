"""
URL routes for the Report of Calibration module.

Included by the project URLconf under ``/api/reports/`` (wired in a later step).
Only a status endpoint exists today.
"""
from django.urls import path

from . import views

app_name = "reports"

urlpatterns = [
    path("info/", views.module_info, name="module-info"),
]
