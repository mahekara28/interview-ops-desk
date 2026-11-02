"""Assemble a walkthrough from browser-test captures of fictional data.

Run npm run test:browser first. Requires Pillow only for media generation.
No screenshots from a live recruiting account should be used here.
"""
from pathlib import Path
from shutil import copyfile
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = root / "test-results"
output = root / "docs/images"
output.mkdir(parents=True, exist_ok=True)
names = ["desk-overview", "desk-draft", "desk-recovery", "desk-receipt", "desk-connections", "desk-mobile"]
for name in names:
    copyfile(source / f"{name}.png", output / f"{name}.png")

scenes = [
    ("desk-overview", "01   COMPARE THE SOURCE EVIDENCE", 3200),
    ("desk-draft", "02   REVIEW THE CANDIDATE UPDATE", 4200),
    ("desk-recovery", "03   RECOVER FROM A SIMULATED TIMEOUT", 3200),
    ("desk-receipt", "04   VERIFY THE LOCAL RECEIPT", 4000),
]
images = [Image.open(output / f"{name}.png").convert("RGB") for name, _, _ in scenes]
width = 1200
scaled = [im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS) for im in images]
height = max(im.height for im in scaled) + 46
font = ImageFont.load_default(size=14)
frames = []
for im, (_, caption, _) in zip(scaled, scenes):
    frame = Image.new("RGB", (width, height), "#f7f8f5")
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, width, 45), fill="#244b40")
    draw.text((22, 15), caption, font=font, fill="#ffffff")
    draw.text((980, 15), "FICTIONAL DEMO DATA", font=font, fill="#e3ebda")
    frame.paste(im, (0, 46))
    frames.append(frame.quantize(colors=128, method=Image.Quantize.MEDIANCUT))
frames[0].save(output / "workflow.gif", save_all=True, append_images=frames[1:], duration=[scene[2] for scene in scenes], loop=0, optimize=True, disposal=2)
print(f"Saved six UI captures and workflow.gif ({(output / 'workflow.gif').stat().st_size // 1024} KiB)")
