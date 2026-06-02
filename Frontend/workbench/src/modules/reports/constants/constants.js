// src/modules/reports/constants/constants.js
//
// Module-private constants for the Report of Calibration tool. Define the
// module's API root once here and import it internally rather than scattering
// the URL string. Phase 2 introduces the per-module /api/reports namespace;
// until then this simply suffixes the shared API base.
import { API_BASE_URL } from "../../../shared/config";

export const REPORTS_API = `${API_BASE_URL}/reports`;
