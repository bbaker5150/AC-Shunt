// src/modules/uncertainty/constants/constants.js
//
// Module-private constants for the Uncertainty Budget tool. Define the
// module's API root once here and import it internally rather than scattering
// the URL string. Phase 2 introduces the per-module /api/uncertainty
// namespace; until then this simply suffixes the shared API base.
import { API_BASE_URL } from "../../../shared/config";

export const UNCERTAINTY_API = `${API_BASE_URL}/uncertainty`;
