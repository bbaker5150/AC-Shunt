"""Smoke tests for the Uncertainty Budget module scaffold."""
from django.apps import apps
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from . import views


class UncertaintyScaffoldTests(TestCase):
    def test_app_is_installed(self):
        self.assertTrue(apps.is_installed("uncertainty"))

    def test_module_info_endpoint(self):
        request = APIRequestFactory().get("/api/uncertainty/info/")
        response = views.module_info(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["module"], "uncertainty")
