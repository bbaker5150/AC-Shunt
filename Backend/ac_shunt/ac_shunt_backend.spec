# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['entry_point.py'],
    pathex=[],
    binaries=[],
    datas=[('ac_shunt', 'ac_shunt'), ('api', 'api')],
    hiddenimports=['channels', 'daphne', 'rest_framework', 'corsheaders'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['autobahn.xbr'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ac_shunt_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ac_shunt_backend',
)
