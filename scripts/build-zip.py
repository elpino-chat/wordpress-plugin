from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / "dist/elpino-chat.zip"
output.parent.mkdir(exist_ok=True)
files = [root / name for name in ("elpino-chat.php", "uninstall.php", "readme.txt", "LICENSE")]
files += sorted(path for path in (root / "assets").rglob("*") if path.is_file())
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, Path("elpino-chat") / path.relative_to(root))
with ZipFile(output) as archive:
    assert archive.testzip() is None
print(output)
