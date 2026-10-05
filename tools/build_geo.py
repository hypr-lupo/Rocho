#!/usr/bin/env python3
"""Genera data/geo.js (topología mundial) y data/src/paises.json (nombres en español).

Fuentes:
  - world-atlas 2.0.2 (Natural Earth 1:50m), https://github.com/topojson/world-atlas
  - i18n-iso-countries 7.14.0 (códigos ISO 3166-1 y nombres en español)

Uso:  python3 tools/build_geo.py
Requiere acceso a cdn.jsdelivr.net. Solo es necesario ejecutarlo si cambia la geometría.
"""
import json
import pathlib
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CDN = "https://cdn.jsdelivr.net/npm/"
TOPO_URL = CDN + "world-atlas@2.0.2/countries-50m.json"
CODES_URL = CDN + "i18n-iso-countries@7.14.0/codes.json"
ES_URL = CDN + "i18n-iso-countries@7.14.0/langs/es.json"

# Territorios sin código ISO numérico en world-atlas.
SIN_ID = {"Kosovo": "XKX"}

# Nombres más usuales en la prensa hispanohablante que los de i18n-iso-countries.
AJUSTES = {
    "USA": "Estados Unidos",
    "GBR": "Reino Unido",
    "RUS": "Rusia",
    "BOL": "Bolivia",
    "VEN": "Venezuela",
    "IRN": "Irán",
    "SYR": "Siria",
    "KOR": "Corea del Sur",
    "PRK": "Corea del Norte",
    "TZA": "Tanzania",
    "COD": "R. D. del Congo",
    "COG": "Congo",
    "CZE": "Chequia",
    "MDA": "Moldavia",
    "VNM": "Vietnam",
    "LAO": "Laos",
    "TWN": "Taiwán",
    "XKX": "Kosovo",
    "NLD": "Países Bajos",
    "DOM": "República Dominicana",
    "CIV": "Costa de Marfil",
}


def bajar(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def main():
    topo = bajar(TOPO_URL)
    codes = bajar(CODES_URL)
    es = bajar(ES_URL)["countries"]

    num_a3 = {num: a3 for a2, a3, num, _ in codes}
    a3_a2 = {a3: a2 for a2, a3, num, _ in codes}

    geoms = topo["objects"]["countries"]["geometries"]
    conservadas = []
    for g in geoms:
        a3 = num_a3.get(g.get("id")) or SIN_ID.get(g["properties"]["name"])
        if not a3:
            continue  # Somalilandia, Chipre del Norte, etc.: sin presencia en el atlas
        g["id"] = a3
        g["properties"] = {}
        conservadas.append(g)
    topo["objects"]["countries"]["geometries"] = conservadas
    # La capa "land" no se usa.
    topo["objects"].pop("land", None)

    paises = {}
    for a3, a2 in a3_a2.items():
        nombre = es.get(a2)
        if isinstance(nombre, list):
            nombre = nombre[0]
        if nombre:
            paises[a3] = AJUSTES.get(a3, nombre)
    paises["XKX"] = "Kosovo"

    (RAIZ / "data").mkdir(exist_ok=True)
    (RAIZ / "data" / "geo.js").write_text(
        "/* Natural Earth 1:50m vía world-atlas 2.0.2. Generado por tools/build_geo.py */\n"
        "window.ATLAS_GEO = " + json.dumps(topo, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    (RAIZ / "data" / "src").mkdir(parents=True, exist_ok=True)
    (RAIZ / "data" / "src" / "paises.json").write_text(
        json.dumps(dict(sorted(paises.items())), ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"geo.js: {len(conservadas)} países · paises.json: {len(paises)} nombres")


if __name__ == "__main__":
    main()
