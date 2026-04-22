from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0014_bugreport_status"),
    ]

    operations = [
        migrations.RenameField(
            model_name="calibrationsettings",
            old_name="characterize_std_first",
            new_name="characterize_test_first",
        ),
    ]
