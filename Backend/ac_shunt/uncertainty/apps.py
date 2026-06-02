from django.apps import AppConfig


class UncertaintyConfig(AppConfig):
    """Uncertainty Budget module — the backend counterpart of the frontend
    ``modules/uncertainty`` tool. Scaffolded empty; its tables (once added)
    route to the dedicated ``uncertainty`` database alias via WorkbenchRouter."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'uncertainty'
    verbose_name = 'Uncertainty Budget'
