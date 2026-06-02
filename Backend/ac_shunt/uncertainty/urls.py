"""
URL routes for the Uncertainty Budget module.

Included by the project URLconf under ``/api/uncertainty/`` (wired in a later
step). Only a status endpoint exists today.
"""
from django.urls import path

from . import views

app_name = "uncertainty"

urlpatterns = [
    path("info/", views.module_info, name="module-info"),
]
