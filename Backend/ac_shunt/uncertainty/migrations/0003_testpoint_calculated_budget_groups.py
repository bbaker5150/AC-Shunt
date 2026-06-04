from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("uncertainty", "0002_testpoint_input_correlations"),
    ]

    operations = [
        migrations.AddField(
            model_name="testpoint",
            name="calculated_budget_groups",
            field=models.JSONField(blank=True, default=list, null=True),
        ),
    ]
