# icon_builder

Tooling that bakes the NAVAIR coin/seal artwork into the app icons and the
runtime 3D emblem. These scripts are run by hand when the branding changes;
nothing here ships at runtime.

## Scripts

- `color_coin.py` — Blender standalone script. Takes the base mesh
  `3demblem.glb` plus the seal texture `navair-seal.png` and bakes a textured
  coin, writing **`navair_coin_final.glb`**.
- `generate_png.py` / `generate_ico.py` — render `navair_coin_final.glb` into
  the PNG/ICO icon assets (`icon.png`, `icon.ico`, `logo192.png`, …).

## Large asset NOT in version control: `navair_coin_final.glb`

`navair_coin_final.glb` is ~116 MB. It is a **generation artifact** (output of
`color_coin.py`, input to the icon renderers), not a runtime asset, so it is
**deliberately excluded from git** to keep the repository small. It was removed
from the full git history during a size-reduction pass.

The master copy lives **outside the repo** in a sibling folder:

```
<your dev root>/_large-assets/navair_coin_final.glb
```

i.e. one directory above this repository's root, alongside the repo folder.

To work with it:

- **Already have it:** copy/symlink it back into `Frontend/icon_builder/` when
  running the icon scripts. Do not commit it (it stays untracked).
- **Need to regenerate it:** run `color_coin.py` in Blender, which rebuilds it
  from `3demblem.glb` + `navair-seal.png` (both still tracked here).

> Note: the path constants inside `color_coin.py` are absolute and point at the
> original author's machine — adjust `MESH_PATH` / `IMAGE_PATH` / `OUTPUT_PATH`
> to your local checkout before running.
