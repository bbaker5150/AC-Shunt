"""
In-process service layer for the Uncertainty Budget module.

Other modules import these thin functions (never HTTP) to read uncertainty data
without crossing process boundaries — the "soft dependency" contract from
docs/adding-a-module.md. Functions here must return plain DTOs (no ORM
objects); consumers snapshot the values they pull so a downstream artifact
stays reproducible even if the source budget is later edited.

Empty until the module has data to expose.
"""
