"""
In-process service layer for the Report of Calibration module.

Other modules import these thin functions (never HTTP) to read report data
without crossing process boundaries — the "soft dependency" contract from
docs/adding-a-module.md. The Report of Calibration module is the downstream end
of the pipeline (AC-Shunt -> Type-A -> Uncertainty Budget -> ROC): it pulls and
snapshots upstream values for reproducibility. Functions here must return plain
DTOs (no ORM objects).

Empty until the module has data to expose.
"""
