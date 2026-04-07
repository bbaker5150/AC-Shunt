from django.apps import AppConfig

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """
        App initialization logic. 
        Note: Database queries are moved to entry_point.py to avoid 
        RuntimeWarnings during Django startup.
        """
        pass