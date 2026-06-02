from django.contrib import admin

from .models import Workstation, WorkstationClaim


@admin.register(Workstation)
class WorkstationAdmin(admin.ModelAdmin):
    """Admin surface for managing the bench inventory.

    Workstations are rarely-edited reference data; this admin page is the
    primary management interface (no React CRUD screen by design — see
    the Phase 1 plan). `is_default` is read-only after creation so the
    auto-created "Local Workstation" cannot be accidentally duplicated.
    """

    list_display = (
        'name', 'identifier', 'location', 'is_active',
        'is_default', 'created_at', 'updated_at',
    )
    list_filter = ('is_active', 'is_default')
    search_fields = ('name', 'identifier', 'location', 'notes')
    readonly_fields = ('is_default', 'created_at', 'updated_at')
    ordering = ('name',)


@admin.register(WorkstationClaim)
class WorkstationClaimAdmin(admin.ModelAdmin):
    """Admin surface for inspecting and breaking stuck claims.

    Normal claim lifecycle is driven by ``HostSyncConsumer``; this page
    exists so an operator can force-release a stale claim when a host's
    socket dies in a way the automatic self-healing path did not cover
    (e.g. a process crash mid-claim that outlived the heartbeat TTL).
    The row is intentionally read-only except for the delete action —
    silent edits to `owner_channel` would desync the live WebSocket state.
    """

    list_display = (
        'workstation', 'owner_label', 'owner_client_id',
        'active_session', 'claimed_at', 'last_heartbeat_at',
    )
    list_select_related = ('workstation', 'active_session')
    search_fields = ('workstation__name', 'owner_label', 'owner_client_id')
    readonly_fields = (
        'workstation', 'owner_channel', 'owner_client_id',
        'owner_label', 'active_session',
        'claimed_at', 'last_heartbeat_at',
    )
