from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pathlib import Path


def _generate_icons() -> None:
    try:
        from PIL import Image, ImageDraw
        static_dir = Path("static")
        static_dir.mkdir(exist_ok=True)
        for size in (192, 512):
            icon_path = static_dir / f"icon-{size}.png"
            if icon_path.exists():
                continue
            img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            r = size // 5
            draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(0, 107, 94, 255))
            ph = size // 4
            pw = int(size * 0.58)
            px = (size - pw) // 2
            py = (size - ph) // 2
            draw.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2, fill=(255, 255, 255, 230))
            lw = max(2, size // 64)
            mx = px + pw // 2
            draw.rectangle([mx - lw, py + lw * 3, mx + lw, py + ph - lw * 3], fill=(0, 107, 94, 255))
            img.save(icon_path, "PNG")
    except Exception:
        pass


_generate_icons()

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")
