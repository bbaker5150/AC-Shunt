from django.apps import AppConfig
import os


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """
        This method is called when the Django application is ready.
        """
        # The check 'RUN_MAIN' or 'WERKZEUG_RUN_MAIN' is to prevent the script
        # from running twice when the development server reloads.
        if os.environ.get('RUN_MAIN') or os.environ.get('WERKZEUG_RUN_MAIN'):
            from .manage_corrections import check_and_update_corrections
            check_and_update_corrections()
            print("CORRECTIONS CHECKED")
