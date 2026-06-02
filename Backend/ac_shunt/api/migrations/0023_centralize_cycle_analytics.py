from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0022_calibrationconfigurations_use_abba_pairing_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='calibrationresults',
            name='manual_excluded_pairs',
            field=models.JSONField(
                default=list, blank=True,
                help_text='1-based pair_num values the operator has excluded from the pair aggregate. Mirrored on both Fwd and Rev rows.',
            ),
        ),
        migrations.AddField(
            model_name='calibrationresults',
            name='use_abba_pairing',
            field=models.BooleanField(
                null=True, blank=True,
                help_text='Per-TP override of CalibrationConfigurations.use_abba_pairing. None = inherit from session config.',
            ),
        ),
        migrations.AddField(
            model_name='calibrationresults',
            name='outlier_filter_mode',
            field=models.CharField(
                max_length=16, default='none',
                choices=[('none', 'None'), ('auto', 'Auto (Chauvenet/IQR)')],
                help_text='Outlier auto-rejection mode applied during pair aggregation. Mirrored across the pair.',
            ),
        ),
        migrations.AddField(
            model_name='calibrationresults',
            name='auto_excluded_pairs',
            field=models.JSONField(
                default=list, blank=True,
                help_text='Computed: pair_num values the backend auto-rejected via outlier_filter_mode. Mirrored across the pair.',
            ),
        ),
        migrations.AddField(
            model_name='calibrationresults',
            name='flagged_pairs',
            field=models.JSONField(
                default=list, blank=True,
                help_text='Computed: pair_num values flagged (not rejected) by the IQR sentinel for small-N datasets.',
            ),
        ),
        migrations.AddField(
            model_name='calibrationresults',
            name='n_pairs_used',
            field=models.PositiveIntegerField(
                null=True, blank=True,
                help_text='Computed: count of pairs that survived (auto ∪ manual) exclusion and contributed to pair_delta_uut_ppm.',
            ),
        ),
    ]
