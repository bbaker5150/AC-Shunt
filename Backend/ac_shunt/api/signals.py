"""
Cross-row sync signals.

Mirrors `CalibrationSettings.n_cycles` between the Forward and Reverse
`TestPoint` siblings of a (current, frequency) pair so the pair-level
cycle count stays consistent without UI gymnastics. AC-DC δ requires N
paired Forward+Reverse measurements where N must match across the two
sides — diverging values would either undercount the pair (if Fwd has
more) or strand orphan reverse cycles (if Rev has more).

The mirror is one-shot and idempotent: a save that doesn't change
`n_cycles` is a no-op, and the recursive save into the sibling row only
fires when the value actually changes. A class-level sentinel prevents
the sibling's own post_save from echoing back.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CalibrationSettings, TestPoint


_IN_FLIGHT = set()


@receiver(post_save, sender=CalibrationSettings)
def mirror_n_cycles_to_sibling(sender, instance, created, update_fields, **kwargs):
    """When `n_cycles` is saved on one direction's settings, copy the value
    to the sibling-direction TestPoint's settings if it exists.

    Guarded against infinite recursion via ``_IN_FLIGHT``: any nested save
    we initiate inside this handler is short-circuited at entry.
    """
    if instance.pk in _IN_FLIGHT:
        return

    # Skip when n_cycles wasn't part of this save (avoids needless sibling
    # round-trips when other fields like nplc / num_samples change).
    if update_fields is not None and 'n_cycles' not in update_fields:
        return

    tp = instance.test_point
    if tp is None:
        return

    opposite_direction = 'Reverse' if tp.direction == 'Forward' else 'Forward'
    try:
        sibling_tp = TestPoint.objects.get(
            test_point_set=tp.test_point_set,
            current=tp.current,
            frequency=tp.frequency,
            direction=opposite_direction,
        )
    except TestPoint.DoesNotExist:
        return

    sibling_settings = getattr(sibling_tp, 'settings', None)
    if sibling_settings is None:
        return

    if sibling_settings.n_cycles == instance.n_cycles:
        return  # Already in sync — nothing to do.

    sibling_settings.n_cycles = instance.n_cycles
    _IN_FLIGHT.add(sibling_settings.pk)
    try:
        sibling_settings.save(update_fields=['n_cycles'])
    finally:
        _IN_FLIGHT.discard(sibling_settings.pk)
