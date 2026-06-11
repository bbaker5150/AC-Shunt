"""
HTTP endpoints for the Uncertainty Budget module (mounted at ``/api/uncertainty/``).

Sessions are read/written as whole nested documents (see ``serializers.py``),
matching how the frontend ``useSessionManager`` loads everything into memory and
persists a session at a time. Instruments (global library), bug reports, and
note images each get their own small collection endpoints.
"""
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import models, serializers


@api_view(["GET"])
@permission_classes([AllowAny])
def module_info(request):
    """Report that the Uncertainty Budget backend is present and wired."""
    return Response({
        "module": "uncertainty",
        "title": "Uncertainty Budget",
        "status": "ready",
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def system_info(request):
    """Expose the backing database type for this module (drives the DB pill)."""
    engine = settings.DATABASES.get("uncertainty", {}).get("ENGINE", "")
    db_type = "sqlite3" if "sqlite3" in engine else "mssql"
    return Response({"module": "uncertainty", "database_type": db_type})


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def sessions(request):
    if request.method == "GET":
        qs = (
            models.Session.objects.all()
            .prefetch_related(
                "measurement_areas", "uuts", "tmdes",
                "test_points__components", "note_images",
            )
        )
        return Response([serializers.session_to_dict(s) for s in qs])

    # POST -> create from whole-session payload.
    session = serializers.save_session(request.data)
    full = (
        models.Session.objects.prefetch_related(
            "measurement_areas", "uuts", "tmdes",
            "test_points__components", "note_images",
        ).get(pk=session.pk)
    )
    return Response(serializers.session_to_dict(full), status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def session_detail(request, session_id):
    if request.method == "DELETE":
        models.Session.objects.filter(pk=session_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == "PUT":
        data = dict(request.data)
        data["id"] = int(session_id)
        serializers.save_session(data)

    session = get_object_or_404(
        models.Session.objects.prefetch_related(
            "measurement_areas", "uuts", "tmdes",
            "test_points__components", "note_images",
        ),
        pk=session_id,
    )
    return Response(serializers.session_to_dict(session))


# --------------------------------------------------------------------------- #
# Instruments (global library)
# --------------------------------------------------------------------------- #
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def instruments(request):
    if request.method == "GET":
        return Response(
            [serializers.instrument_to_dict(i) for i in models.Instrument.objects.all()]
        )
    obj = serializers.save_instrument(request.data)
    return Response(serializers.instrument_to_dict(obj), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([AllowAny])
def instrument_detail(request, instrument_id):
    models.Instrument.objects.filter(pk=str(instrument_id)).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Custom equations (global measurement-equation library)
# --------------------------------------------------------------------------- #
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def equations(request):
    if request.method == "GET":
        return Response(
            [
                serializers.custom_equation_to_dict(e)
                for e in models.CustomEquation.objects.all()
            ]
        )
    obj = serializers.save_custom_equation(request.data)
    return Response(
        serializers.custom_equation_to_dict(obj), status=status.HTTP_201_CREATED
    )


@api_view(["DELETE"])
@permission_classes([AllowAny])
def equation_detail(request, equation_id):
    models.CustomEquation.objects.filter(pk=str(equation_id)).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Bug reports
# --------------------------------------------------------------------------- #
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def bug_reports(request):
    if request.method == "GET":
        return Response(
            [serializers.bug_report_to_dict(b) for b in models.BugReport.objects.all()]
        )
    obj = serializers.save_bug_report(request.data)
    return Response(serializers.bug_report_to_dict(obj), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([AllowAny])
def bug_report_detail(request, report_id):
    models.BugReport.objects.filter(pk=str(report_id)).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Session note images (base64 data fetched/saved separately from the session)
# --------------------------------------------------------------------------- #
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def session_images(request, session_id):
    session = get_object_or_404(models.Session, pk=session_id)
    if request.method == "GET":
        return Response([
            {"id": serializers._coerce_id(img.cid), "data": img.data}
            for img in session.note_images.all()
            if img.data
        ])

    image_id = request.data.get("imageId")
    data_b64 = request.data.get("dataBase64", "")
    obj, _ = models.NoteImage.objects.get_or_create(
        session=session, cid=serializers._cid(image_id)
    )
    obj.data = data_b64 or obj.data
    if request.data.get("fileName"):
        obj.file_name = request.data.get("fileName")
    obj.save()
    return Response({"id": serializers._coerce_id(obj.cid)}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([AllowAny])
def session_image_detail(request, session_id, image_id):
    models.NoteImage.objects.filter(
        session_id=session_id, cid=serializers._cid(image_id)
    ).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
