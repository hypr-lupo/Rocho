#!/usr/bin/env python3
"""Genera dist/atlas-artifact.html: una versión de una sola página para publicar como Artifact de claude.ai.

Diferencias con index.html:
  - Sin <!doctype>, <html>, <head> ni <body> (el servicio agrega su propio esqueleto).
  - d3 y topojson se cargan desde cdnjs (única fuente de scripts admitida por la política del servicio).
  - Estilos, geometría, datos y lógica van incrustados.

Uso:  python3 tools/build_artifact.py   (ejecute antes tools/build.py)
"""
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DIST = RAIZ / "dist"


def leer(rel):
    return (RAIZ / rel).read_text(encoding="utf-8")


def script(js):
    # Evita que una secuencia "</script" dentro de los datos cierre la etiqueta.
    return "<script>\n" + re.sub(r"</(script)", r"<\\/\1", js, flags=re.I) + "\n</script>\n"


def main():
    html = leer("index.html")
    cuerpo = re.search(r"<!--CUERPO-->(.*)<!--/CUERPO-->", html, re.S).group(1)
    fuentes = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com[^"]+)">', html).group(1)
    salida = (
        "<title>Atlas Criminal de América Latina</title>\n"
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        f'<link rel="stylesheet" href="{fuentes}">\n'
        "<style>\n" + leer("assets/app.css") + "\n</style>\n"
        + cuerpo
        + '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>\n'
        + '<script src="https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"></script>\n'
        + script(leer("data/geo.js"))
        + script(leer("data/atlas.js"))
        + script(leer("assets/app.js"))
    )
    DIST.mkdir(exist_ok=True)
    destino = DIST / "atlas-artifact.html"
    destino.write_text(salida, encoding="utf-8")
    print(f"Escrito {destino.relative_to(RAIZ)} ({destino.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
