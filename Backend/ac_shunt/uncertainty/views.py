"""
Views for the Uncertainty Budget module.

A single lightweight status endpoint so the ``/api/uncertainty/`` namespace
resolves and clients can confirm the module backend is reachable. Real
endpoints arrive as the module is built out.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def module_info(request):
    """Report that the Uncertainty Budget backend is present and wired."""
    return Response({
        "module": "uncertainty",
        "title": "Uncertainty Budget",
        "status": "scaffolded",
    })
