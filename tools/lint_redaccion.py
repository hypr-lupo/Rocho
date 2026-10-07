#!/usr/bin/env python3
"""Busca infracciones de GUIA_REDACCION.md en los textos del atlas.

Uso:  python3 tools/lint_redaccion.py              (informe completo)
      python3 tools/lint_redaccion.py sinaloa cjng (solo esas fichas)
      python3 tools/lint_redaccion.py --resumen    (solo totales por regla)

El script revisa los campos de texto de data/src/orgs/*.json, data/src/externos.json,
data/src/taxonomia.json, README.md y GUIA_REDACCION.md. No revisa nombres, alias, zonas ni títulos de fuentes.
El código de salida es 1 si encuentra infracciones.
"""
import glob
import json
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

LIMITE_DESCRIPTIVO = 25
LIMITE_PARRAFO = 6

REGLAS = [
    ("punto y coma", re.compile(r";")),
    ("raya o guion entre espacios", re.compile(r"—|[^\S\n]–[^\S\n]|[^\S\n]-[^\S\n]")),
    ("modal o duda prohibida", re.compile(r"\b(podr[íi]a|podr[íi]an|deber[íi]a|deber[íi]an|quiz[áa]s?|tal vez|posiblemente)\b", re.I)),
    ("pretérito perfecto compuesto", re.compile(r"\b(he|has|ha|hemos|han)\s+(sido|estado|\w+(ado|ido|ito|isto|ierto|echo|ucho|uelto|esto))\b", re.I)),
    ("gerundio tras coma", re.compile(r",\s+\w+(ando|iendo|yendo)\b", re.I)),
    ("palabra sin contenido", re.compile(
        r"\b(crucial(es)?|fundamental(es)?|significativ[oa]s?|significativamente|poderos[oa]s?|sin precedentes|"
        r"cabe (destacar|señalar|mencionar)|es importante (señalar|destacar|notar)|en este sentido|"
        r"a fin de|con el fin de|con el objetivo de|asimismo|en conclusión|en resumen|etc\.|etcétera|"
        r"vale la pena)\b", re.I)),
    ("«no solo... sino»", re.compile(r"\bno s[óo]lo\b[^.]*\bsino\b", re.I)),
    ("abreviatura e.g./i.e./p. ej.", re.compile(r"\b(e\.g\.|i\.e\.|p\. ?ej\.)", re.I)),
    ("término no unificado", re.compile(r"\b(captur(ó|aron|ado|ada|ados|adas|ar)|aprehendi(ó|eron|do|da)|arrest(ó|aron|ado|ada)|abatid[oa]s?|abati(ó|eron|r))\b", re.I)),
]

ABREV = r"(EE\. UU\.|S\. A\.|S\.A\.|C\. V\.|de C\.V\.|Sr\.|Sra\.|Dr\.|núm\.|art\.|N\.º|No\.|Jr\.|U\.S\.|St\.)"


def palabras(oracion):
    s = re.sub(r"\([^)]*\)", " X ", oracion)
    s = re.sub(r"«[^»]*»|\"[^\"]*\"|“[^”]*”", " X ", s)
    return len(s.split())


def oraciones(parrafo):
    s = re.sub(ABREV, lambda m: m.group(0).replace(".", "§"), parrafo)
    s = re.sub(r"\b([A-ZÁÉÍÓÚ])\.", r"\1§", s)  # iniciales: «Armando M. L.»
    partes = re.split(r"(?<=[.!?])\s+(?=[«\"(¿¡A-ZÁÉÍÓÚÑ0-9])|\n", s)
    return [p.replace("§", ".") for p in partes if p.strip()]


def revisar(texto, donde, salida):
    if not texto or not texto.strip():
        return
    # El texto citado (alias, citas, ejemplos) no se cambia: no se revisa con las reglas de palabras.
    sin_citas = re.sub(r"«[^»]*»|“[^”]*”", "«»", texto)
    for nombre, rx in REGLAS:
        for m in rx.finditer(sin_citas):
            ini = max(0, m.start() - 40)
            salida.append((donde, nombre, sin_citas[ini:m.end() + 40].replace("\n", " ")))
    for parrafo in re.split(r"\n\s*\n", texto):
        ors = oraciones(parrafo.strip())
        if len(ors) > LIMITE_PARRAFO:
            salida.append((donde, f"párrafo de {len(ors)} oraciones", parrafo[:80]))
        for o in ors:
            n = palabras(o)
            if n > LIMITE_DESCRIPTIVO:
                salida.append((donde, f"oración de {n} palabras", o[:120]))


def textos_ficha(o):
    for c in ("resumen", "situacion_actual", "estructura", "notas_controversia", "fundacion"):
        yield c, o.get(c, "")
    for l in o.get("lideres", []):
        yield f"lider {l['nombre']} (rol)", l.get("rol", "")
        yield f"lider {l['nombre']} (estado)", l.get("estado", "")
    for d in o.get("designaciones", []):
        yield f"designacion {d['autoridad'][:30]}", d.get("categoria", "")
    for p in o.get("presencia", []):
        yield f"presencia {p['pais']}", p.get("nota", "")
    for v in o.get("vinculos", []):
        yield f"vinculo {v['destino']}/{v['tipo']}", v.get("descripcion", "")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    resumen = "--resumen" in sys.argv
    salida = []
    for p in sorted(glob.glob(str(RAIZ / "data/src/orgs/*.json"))):
        o = json.load(open(p, encoding="utf-8"))
        if args and o["id"] not in args:
            continue
        for campo, texto in textos_ficha(o):
            revisar(texto, f"{o['id']} · {campo}", salida)
    if not args:
        for e in json.load(open(RAIZ / "data/src/externos.json", encoding="utf-8")):
            revisar(e.get("descripcion", ""), f"externo {e['id']}", salida)
        tax = json.load(open(RAIZ / "data/src/taxonomia.json", encoding="utf-8"))
        for grupo, items in tax.items():
            for it in items:
                revisar(it.get("def", ""), f"taxonomía {grupo}/{it['id']}", salida)
        for doc in ("README.md", "GUIA_REDACCION.md"):
            texto = (RAIZ / doc).read_text(encoding="utf-8")
            prosa = re.sub(r"```.*?```", "", texto, flags=re.S)
            prosa = "\n".join(l for l in prosa.splitlines() if not l.startswith(("|", "#")))
            revisar(prosa, doc, salida)
            if "**" in texto:
                salida.append((doc, "negrita", "**"))
    if resumen:
        from collections import Counter
        c = Counter(re.sub(r"\d+", "N", r[1]) for r in salida)
        for k, v in c.most_common():
            print(f"{v:5}  {k}")
    else:
        for donde, regla, extracto in salida:
            print(f"{donde} | {regla} | {extracto}")
    print(f"{len(salida)} infracciones")
    return 1 if salida else 0


if __name__ == "__main__":
    sys.exit(main())
