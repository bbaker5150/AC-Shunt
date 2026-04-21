from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_tvcsensitivity'),
    ]

    operations = [
        migrations.CreateModel(
            name='PendingReadingWrite',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_id', models.IntegerField(db_index=True)),
                ('test_point_id', models.IntegerField(blank=True, db_index=True, null=True)),
                ('test_point_lookup', models.JSONField(blank=True, default=dict,
                    help_text='Fallback {current, frequency, direction} used when test_point_id is missing.')),
                ('reading_type_full', models.CharField(max_length=64)),
                ('readings_json', models.JSONField(blank=True, default=list)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('in_flight', 'In flight'),
                        ('done', 'Done'),
                        ('failed', 'Failed'),
                    ],
                    db_index=True,
                    default='pending',
                    max_length=16,
                )),
                ('attempts', models.IntegerField(default=0)),
                ('last_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('last_attempt_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='pendingreadingwrite',
            index=models.Index(fields=['status', 'created_at'], name='api_pending_status__b6fd79_idx'),
        ),
    ]
