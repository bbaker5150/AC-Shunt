from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("uncertainty", "0003_testpoint_calculated_budget_groups"),
    ]

    operations = [
        migrations.AddField(
            model_name="testpoint",
            name="coverage_factor_mode",
            field=models.CharField(blank=True, default="auto", max_length=16),
        ),
        migrations.AddField(
            model_name="testpoint",
            name="coverage_factor_override",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
