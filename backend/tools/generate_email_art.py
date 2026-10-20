"""Rebuild the email illustration: .venv/bin/python tools/generate_email_art.py.

Pillow is already included through matplotlib. No fonts or external assets are needed.
The first frame deliberately shows the robot in the middle for static email clients.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH, HEIGHT, SCALE = 600, 216, 3
FRAME_COUNT, FRAME_MS = 96, 80
ORANGE = "#ff6b42"
INK = "#20241f"
OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "email"


def background() -> Image.Image:
    image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), ORANGE)
    draw = ImageDraw.Draw(image)
    for x in range(36, WIDTH, 24):
        for y in range(24, 192, 24):
            draw.ellipse((x * SCALE, y * SCALE, x * SCALE + 2, y * SCALE + 2), fill="#e45e39")
    draw.ellipse((132 * SCALE, -62 * SCALE, 468 * SCALE, 274 * SCALE), outline="#f77f57", width=SCALE)
    draw.ellipse((170 * SCALE, -24 * SCALE, 430 * SCALE, 236 * SCALE), outline="#f77f57", width=SCALE)
    for x in range(60, 540, 14):
        draw.line((x * SCALE, 176 * SCALE, (x + 6) * SCALE, 176 * SCALE), fill="#c84f2e", width=SCALE)
    for x in (52, 548):
        draw.ellipse(
            ((x - 7) * SCALE, 169 * SCALE, (x + 7) * SCALE, 183 * SCALE),
            fill=ORANGE,
            outline="#a94227",
            width=SCALE,
        )
        draw.ellipse(((x - 2) * SCALE, 174 * SCALE, (x + 2) * SCALE, 178 * SCALE), fill="#a94227")
    for x, y in ((76, 76), (518, 50)):
        draw.line(((x - 4) * SCALE, y * SCALE, (x + 4) * SCALE, y * SCALE), fill="#ffbd92", width=SCALE)
        draw.line((x * SCALE, (y - 4) * SCALE, x * SCALE, (y + 4) * SCALE), fill="#ffbd92", width=SCALE)
    return image


def robot(frame: int, backdrop: Image.Image) -> Image.Image:
    phase = 2 * math.pi * frame / FRAME_COUNT
    center = 300 + 160 * math.sin(phase)
    direction = 1 if math.cos(phase) >= 0 else -1
    bob = math.sin(phase * 8) * 0.8
    image = backdrop.copy()
    draw = ImageDraw.Draw(image)

    def box(coords: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
        x1, y1, x2, y2 = coords
        return (
            round((center + x1) * SCALE),
            round((y1 + bob) * SCALE),
            round((center + x2) * SCALE),
            round((y2 + bob) * SCALE),
        )

    def line(points: list[tuple[float, float]], color: str, width: int = 1) -> None:
        draw.line(
            [(round((center + x) * SCALE), round((y + bob) * SCALE)) for x, y in points],
            fill=color,
            width=width * SCALE,
        )

    def rounded(coords: tuple[float, float, float, float], radius: int, color: str) -> None:
        draw.rounded_rectangle(box(coords), radius=radius * SCALE, fill=color)

    draw.ellipse(box((-70, 180, 70, 189)), fill="#e55d35")
    for offset, length in ((0, 19), (10, 30), (20, 13)):
        tail = -direction * 78
        line([(tail, 124 + offset), (tail - direction * length, 124 + offset)], "#a94227")

    # Two rolling wheels; the hubs visibly rotate with the travel direction.
    for x in (-37, 37):
        draw.ellipse(box((x - 12, 153, x + 12, 177)), fill=INK)
        draw.ellipse(box((x - 7, 158, x + 7, 172)), fill="#41483c")
        angle = (center - 300) / 10
        line(
            [
                (x - 4 * math.cos(angle), 165 - 4 * math.sin(angle)),
                (x + 4 * math.cos(angle), 165 + 4 * math.sin(angle)),
            ],
            "#ffad82",
            2,
        )

    # Low, friendly warehouse AMR with an inset face and a tiny sensor mast.
    line([(-40, 111), (-40, 94)], INK, 3)
    draw.ellipse(box((-44, 87, -36, 95)), fill=INK)
    draw.ellipse(box((-42, 88, -39, 91)), fill="#fff3ce")
    rounded((-59, 108, 59, 161), 17, INK)
    rounded((-48, 113, 48, 116), 1, "#444a3e")
    rounded((-43, 121, 43, 149), 9, "#353d32")
    blink = frame in (31, 32, 75, 76)
    for eye_x in (-13 + direction * 3, 13 + direction * 3):
        rounded((eye_x - 3, 130 if not blink else 134, eye_x + 3, 139), 3, "#fff3ce")
    draw.arc(box((-5 + direction * 3, 136, 5 + direction * 3, 143)), 5, 175, fill="#ff9c70", width=SCALE)
    rounded((-23, 154, 23, 156), 1, "#ff9166")

    # A taped cardboard parcel, complete with a small shipping label.
    rounded((-32, 55, 32, 108), 4, INK)
    rounded((-30, 57, 30, 106), 3, "#ffe0a7")
    draw.rectangle(box((20, 58, 29, 105)), fill="#e9ba7c")
    draw.rectangle(box((-4, 57, 5, 105)), fill="#ffb773")
    line([(-30, 69), (29, 69)], "#bd8b56")
    draw.rectangle(box((-4, 57, 5, 69)), fill="#ffecc5")
    rounded((-23, 80, -9, 97), 1, "#fff8e8")
    for x in (-20, -17, -15):
        line([(x, 84), (x, 91)], INK)
    line([(-20, 94), (-12, 94)], "#a07f5a")
    # Orientation mark on the box.
    line([(12, 91), (12, 80), (9, 83)], INK)
    line([(12, 80), (15, 83)], INK)
    return image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    backdrop = background()
    frames = [robot(frame, backdrop) for frame in range(FRAME_COUNT)]
    frames[0].save(OUTPUT / "robot-delivery.png", optimize=True)
    # One shared palette prevents color flickering and keeps the GIF lightweight.
    palette = frames[0].quantize(colors=64, dither=Image.Dither.NONE)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(
        OUTPUT / "robot-delivery.gif",
        save_all=True,
        append_images=indexed[1:],
        duration=FRAME_MS,
        loop=0,
        optimize=True,
        disposal=1,
    )
    for name in ("robot-delivery.gif", "robot-delivery.png"):
        path = OUTPUT / name
        print(f"{path}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
