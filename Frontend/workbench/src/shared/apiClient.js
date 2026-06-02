import axios from "axios";
import axiosRetry from "axios-retry";

// ---------------------------------------------------------------------
// Shared HTTP client configuration.
// ---------------------------------------------------------------------
// Configures the global axios singleton with retry/backoff once, at boot
// (imported from index.jsx). Every module imports the plain `axios`
// singleton, so configuring it here applies the same resilient behavior
// app-wide — important for the ~21s cold boot of the bundled backend exe.
// ---------------------------------------------------------------------
axiosRetry(axios, {
  retries: 15, // Up to 15 attempts — plenty for the ~21s cold boot.
  retryDelay: () => 2000, // Fixed 2s between attempts.
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    error.code === "ERR_NETWORK" ||
    error.code === "ECONNREFUSED",
});

export default axios;
