# Adding a Module to the Metrology Workbench

This guide walks a developer through adding a new tool module — for example, an "Uncertainty Budget" or "Report of Calibration" tool — to the Metrology Workbench. It covers the frontend structure, the shared layers every module can use, routing and lazy-loading, conventions to follow, and the backend parallel for Phase 2+.

---

## Mental model

The Workbench is a shell that hosts independent tool modules. Think of it like a window manager: the shell provides a common top bar, theme, notification system, and router, then gets out of the way. Each module is a self-contained React subtree that owns its own state, API calls, styles, and (backend) Django app and database. Modules do not import from each other. The only shared surface is `src/shared/` — keep it small and stable.

```
Frontend/
  <workbench-folder>/
    src/
      index.jsx            ← entry point; wires providers + router
      app/                 ← shell: WorkbenchShell, top bar, launcher, router
      shared/              ← THE ONLY cross-cutting surface (keep small)
      modules/
        ac-shunt/          ← existing module (reference implementation)
        uncertainty/       ← your new module goes here
        reports/
```

---

## Step 1 — Register the module (the only shared-file edit)

Open [`src/app/moduleRegistry.jsx`](../Frontend/workbench/src/app/moduleRegistry.jsx) and append one entry to the `MODULES` array:

```jsx
{
  id: "uncertainty",          // kebab-case; becomes the URL segment /uncertainty/*
  title: "Uncertainty Budget",
  subtitle: "Assemble an uncertainty budget",
  path: "/uncertainty",
  status: "coming-soon",      // "ready" once the module root is built
  Component: null,            // replace with lazy(() => import(...)) when ready
},
```

This is the **only file you edit that any other module also touches.** The router (`app/routes.jsx`) and the launcher (`app/HomeLauncher.jsx`) both read from this array — you get a launcher card and a route for free.

When your module root is ready, flip to:
```jsx
status: "ready",
Component: lazy(() => import("../modules/uncertainty/UncertaintyApp")),
```

---

## Step 2 — Create the module folder

```
src/modules/uncertainty/
  UncertaintyApp.jsx      ← module root (the Component above points here)
  contexts/               ← module-private React contexts and providers
  components/             ← module-private components
  hooks/                  ← module-private hooks
  utils/                  ← module-private utilities
  constants/              ← module-private constants
  UncertaintyApp.css      ← module styles (scoped to your component tree)
```

Nothing under `modules/uncertainty/` is imported by the shell or by other modules. You own this tree completely.

---

## Step 3 — Write the module root

`UncertaintyApp.jsx` is what the router mounts. Wrap it in whatever providers your module needs — context providers that only your module uses live here, not at the workbench root.

```jsx
import React from "react";
import { UncertaintyProvider } from "./contexts/UncertaintyContext";
import UncertaintyMain from "./components/UncertaintyMain";
import "./UncertaintyApp.css";

export default function UncertaintyApp() {
  return (
    <UncertaintyProvider>
      <UncertaintyMain />
    </UncertaintyProvider>
  );
}
```

The workbench shell mounts this inside a `<Suspense>` fallback, so the module loads lazily in its own JS chunk — a dev working on the uncertainty module rarely triggers a rebuild of `ac-shunt`.

---

## Routing inside a module

The router gives each module the wildcard path `/<id>/*`, so you can add internal routes using react-router-dom's `<Routes>` / `<Route>` directly inside your module root. The shell never knows about your internal navigation.

```jsx
import { Routes, Route } from "react-router-dom";

export default function UncertaintyApp() {
  return (
    <UncertaintyProvider>
      <Routes>
        <Route index element={<BudgetList />} />
        <Route path=":budgetId" element={<BudgetDetail />} />
      </Routes>
    </UncertaintyProvider>
  );
}
```

---

## Shared layers your module can use

These are the only things in `src/shared/`. Import from here; do not copy them into your module.

### Theme — `useTheme()`

```jsx
import { useTheme } from "../../shared/ThemeContext";
const { theme } = useTheme(); // "light" | "dark"
```

The shell applies `body.light-mode` / `body.dark-mode` globally. You can CSS-in your own design tokens or just use the same `--background-color` / `--text-color` etc. tokens that `App.css` defines. If you add new tokens, define them in your own module CSS rather than patching `App.css`.

### Notifications — `useNotifications()`

```jsx
import { useNotifications } from "../../shared/NotificationContext";
const { showNotification } = useNotifications();

showNotification("Budget saved.", "success");          // types: success, error, warning, info
showNotification("Something went wrong.", "error", 6000); // custom duration in ms
```

The toast stack renders at the workbench root, above all modules.

**Current caveat:** toast *styling* lives in `modules/ac-shunt/App.css` and is only guaranteed present after AC-Shunt has mounted. If your module needs to raise toasts before AC-Shunt has ever loaded, promote the design tokens and `.notification-toast*` rules into a shared global stylesheet (see the note inside `NotificationContext.jsx`).

### HTTP client — `axios` (pre-configured)

```jsx
import axios from "axios";                          // the global singleton
import { API_BASE_URL } from "../../shared/config"; // "http://<host>:8000/api"
```

`src/shared/apiClient.js` is imported once at boot in `index.jsx` and configures the axios singleton with a 15-retry / 2 s-delay policy — important because the bundled backend exe takes ~21 s to cold-start. Every module that imports `axios` picks this up automatically; you do not need to configure it yourself.

### Config — `src/shared/config.js`

```jsx
import { API_BASE_URL, WS_BASE_URL, baseIp, BACKEND_PORT } from "../../shared/config";
```

`API_BASE_URL` is `http://<host>:8000/api`. After Phase 2 introduces per-module URL namespaces, construct your API root as:

```js
const UNCERTAINTY_API = `${API_BASE_URL}/uncertainty`;
```

`WS_BASE_URL` is `ws://<host>:8000/ws` — prepend your module's WS namespace when opening sockets.

---

## Conventions

- **No cross-module imports.** `modules/uncertainty/` must never import from `modules/ac-shunt/`. If you need data from another module use the in-process service layer (see Pipeline contracts below) or manual import.
- **No growing `shared/`.** If a component or hook is only used by your module, it lives in your module. Only promote to `shared/` when a second module concretely needs the same thing — and even then, discuss first because `shared/` is the highest-conflict surface in the repo.
- **Module-private styles.** Put your CSS in `modules/uncertainty/YourApp.css` and import it in your module root. Avoid global selectors that could collide with other modules.
- **API base URL in your own constants.** Define `const UNCERTAINTY_API = \`${API_BASE_URL}/uncertainty\`` once in your own `constants/` and import it internally; do not scatter the URL string.
- **Module root is the `React.lazy()` target.** The default export of `UncertaintyApp.jsx` is what gets lazy-loaded. Keep it the module's sole public surface.

---

## Pipeline contracts (soft dependencies between modules)

Modules are **functionally independent.** A user must be able to use any module fully via manual import/entry — no module may require another to be populated. The pipeline is optional sugar on top.

When module A produces data that module B can optionally consume:

1. **A exposes a thin in-process service** (not an HTTP call):
   ```python
   # uncertainty/services.py
   def get_type_a_uncertainty(session_id: int) -> dict:
       ...  # returns a plain DTO, no ORM objects
   ```
2. **B snapshots the values at import time** — B stores both the source ID and a copy of the values, so the budget stays reproducible even if the source calibration is later edited.
3. **B wraps the auto-pull in a try/import guard.** If A is absent or has no matching data, the auto-pull affordance simply doesn't appear — manual entry takes over. This must never be an error.

---

## Backend parallel (Phase 2+)

Each frontend module has a matching Django app. Here is the shape for a new `uncertainty` app:

### 1. Create the Django app

```
Backend/ac_shunt/
  uncertainty/
    __init__.py
    apps.py
    models.py
    serializers.py
    views.py
    urls.py          ← HTTP routes for /api/uncertainty/
    routing.py       ← WebSocket routes for /ws/uncertainty/
    consumers.py
    services.py      ← in-process API for cross-module data access
    db_routers.py    ← (optional, if not handled by WorkbenchRouter)
    migrations/
```

### 2. Register the DB alias in `settings.py`

```python
DATABASES = {
    "default": { ... },
    "outbox":  { ... },
    "uncertainty": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": CREDENTIALS_DIR / "uncertainty.sqlite3",
    },
}
```

### 3. Add the app to `WorkbenchRouter`'s map

In `ac_shunt/db_routers.py` (the generalized router from Phase 2):

```python
APP_DB_MAP = {
    "uncertainty": "uncertainty",
    "reports":     "reports",
}
```

### 4. Namespace URLs and WebSockets

In `ac_shunt/urls.py`:
```python
path("api/uncertainty/", include("uncertainty.urls")),
```

In `ac_shunt/asgi.py`, concatenate the app's `websocket_urlpatterns` (namespaced under `ws/uncertainty/`).

### 5. Verify isolation

After `python manage.py makemigrations uncertainty` and `migrate`:
- `api` tables remain on `default`
- `uncertainty` tables land on the `uncertainty` alias
- `PendingReadingWrite` (outbox) still pins to `outbox`
- `python manage.py runserver` boots clean
- `/api/uncertainty/` responds; `/api/ac-shunt/` and the legacy `/api/` alias still respond

---

## Verification checklist

Before marking a module as `status: "ready"` in the registry:

- [ ] `npm run dev:mock` — launcher shows the new card; clicking it mounts the module; the global top bar is present inside the module; Back-to-Workbench nav works
- [ ] `npm run electron:dev:mock` — same, under `file://`; window min/max/close functional from within the module
- [ ] `npm test` — vitest suite green (add a smoke test for your module root)
- [ ] No imports from `modules/<other-module>/` in your tree (`grep -r "modules/ac-shunt" src/modules/uncertainty` returns empty)
- [ ] Backend: `python manage.py test uncertainty` green; DB isolation verified per Step 5 above
- [ ] Manual import path works end-to-end without any other module populated
