#!/usr/bin/env python3
"""Valida las fichas de data/src y genera data/atlas.js.

Uso:  python3 tools/build.py            (valida y genera)
      python3 tools/build.py --check    (solo valida; código de salida 1 si hay errores)

Estructura de entrada:
  data/src/taxonomia.json     delitos, niveles, tipos de vínculo, tipos de organización, familias
  data/src/paises.json        nombres en español por código ISO 3166-1 alfa-3 (tools/build_geo.py)
  data/src/externos.json      actores fuera del catálogo (mafias extrarregionales, etc.)
  data/src/orgs/<id>.json     una ficha por organización
"""
import json
import pathlib
import sys
from urllib.parse import urlsplit, urlunsplit

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SRC = RAIZ / "data" / "src"
SALIDA = RAIZ / "data" / "atlas.js"
# Rutas alternativas para pruebas:  --src <dir> --out <archivo>
for _i, _a in enumerate(sys.argv):
    if _a == "--src":
        SRC = pathlib.Path(sys.argv[_i + 1]).resolve()
    if _a == "--out":
        SALIDA = pathlib.Path(sys.argv[_i + 1]).resolve()
CORTE = "2026-10-05"

REGIONES = [
    ("mca", "México y Centroamérica", True,
     "MEX GTM BLZ HND SLV NIC CRI PAN"),
    ("car", "Caribe", True,
     "CUB HTI DOM JAM PRI TTO BHS BRB CUW ABW LCA VCT GRD ATG DMA KNA TCA CYM VGB VIR SXM BES MAF BLM AIA MSR GLP MTQ"),
    ("sud", "Sudamérica", True,
     "COL VEN ECU PER BOL BRA PRY URY ARG CHL GUY SUR GUF"),
    ("nam", "EE. UU. y Canadá", False, "USA CAN"),
    ("eur", "Europa", False,
     "ESP PRT ITA FRA NLD BEL DEU GBR IRL ALB MNE SRB HRV BIH GRC CZE POL CHE AUT SWE NOR DNK FIN ROU BGR "
     "UKR RUS XKX MKD SVN LUX MLT CYP HUN SVK EST LVA LTU ISL AND MCO GIB"),
    ("afr", "África", False,
     "NGA ZAF GNB GHA MOZ CPV SEN MAR BEN TGO CIV GIN AGO NAM KEN ETH EGY LBY TZA DZA TUN MLI NER SLE LBR "
     "GMB MRT CMR GAB COD COG UGA ZMB ZWE MWI MDG BFA TCD SDN SOM"),
    ("asi", "Asia y Oceanía", False,
     "CHN IND AUS NZL HKG MAC TWN JPN PHL MYS THA IDN VNM KOR LBN ISR ARE SAU TUR IRN SYR PAK AFG MMR LAO "
     "KHM SGP BGD LKA NPL QAT KWT OMN JOR IRQ YEM AZE GEO ARM KAZ UZB PNG FJI"),
]
REGION_DE = {c: rid for rid, _, _, cs in REGIONES for c in cs.split()}

CATEGORIAS = {"oficial", "investigacion", "prensa", "academica"}
CONF_ORDEN = {"baja": 0, "media": 1, "alta": 2}
DIRIGIDOS = {"suministro", "escision"}

errores = []
avisos = []


def err(msg):
    errores.append(msg)


def aviso(msg):
    avisos.append(msg)


def cargar(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def norm_url(u):
    s = urlsplit(u.strip())
    ruta = s.path.rstrip("/") or "/"
    return urlunsplit((s.scheme.lower(), s.netloc.lower().removeprefix("www."), ruta, s.query, ""))


def main(solo_validar=False):
    tax = cargar(SRC / "taxonomia.json")
    nombres = cargar(SRC / "paises.json")
    externos_src = cargar(SRC / "externos.json") if (SRC / "externos.json").exists() else []

    DEL = {d["id"] for d in tax["delitos"]}
    NIV = {n["id"] for n in tax["niveles"]}
    VIN = {v["id"] for v in tax["vinculos"]}
    TIPOS = {t["id"]: t["familia"] for t in tax["tipos"]}
    CONF = {c["id"] for c in tax["confianza"]}

    archivos = sorted((SRC / "orgs").glob("*.json"))
    orgs_src = [cargar(p) for p in archivos]
    ids_org = {o["id"] for o in orgs_src}
    ids_ext = {e["id"] for e in externos_src}
    if ids_org & ids_ext:
        err(f"ids duplicados entre organizaciones y externos: {ids_org & ids_ext}")

    # ---- Registro global de fuentes (deduplicadas por URL) ----
    registro = {}  # url normalizada -> dict

    def registrar(f, ctx):
        url = (f.get("url") or "").strip()
        if not url.startswith(("https://", "http://")):
            err(f"{ctx}: URL inválida {url!r}")
            return None
        if f.get("categoria") not in CATEGORIAS:
            err(f"{ctx}: categoría de fuente inválida {f.get('categoria')!r}")
        k = norm_url(url)
        r = registro.get(k)
        if r is None:
            r = registro[k] = {
                "titulo": f.get("titulo", "").strip() or url,
                "editor": f.get("editor", "").strip() or urlsplit(url).netloc,
                "fecha": f.get("fecha", ""),
                "url": url,
                "cat": f.get("categoria", "prensa"),
                "ver": bool(f.get("verificada")),
            }
        else:
            r["ver"] = r["ver"] or bool(f.get("verificada"))
        return k

    # ---- Externos ----
    externos = []
    for e in externos_src:
        ctx = f"externo {e['id']}"
        if e["pais"] not in nombres:
            err(f"{ctx}: país desconocido {e['pais']}")
        claves = [registrar(f, ctx) for f in e.get("fuentes", [])]
        externos.append({
            "id": e["id"], "nombre": e["nombre"], "corto": e.get("corto") or e["nombre"],
            "pais": e["pais"], "descripcion": e["descripcion"], "_f": [c for c in claves if c],
        })

    # ---- Organizaciones ----
    orgs = []
    vinc_raw = []
    usados = set()
    for o in orgs_src:
        ctx = f"org {o['id']}"
        for campo in ("id", "nombre", "corto", "tipo", "pais_origen", "resumen", "situacion_actual",
                      "presencia", "delitos", "fuentes", "confianza_general"):
            if campo not in o:
                err(f"{ctx}: falta el campo {campo}")
        if o.get("tipo") not in TIPOS:
            err(f"{ctx}: tipo inválido {o.get('tipo')!r}")
        if o.get("confianza_general") not in CONF:
            err(f"{ctx}: confianza_general inválida")
        if o.get("pais_origen") not in nombres:
            err(f"{ctx}: país de origen desconocido {o.get('pais_origen')}")
        usados.add(o.get("pais_origen"))

        local = {}
        for f in o.get("fuentes", []):
            if f["id"] in local:
                err(f"{ctx}: id de fuente repetido {f['id']}")
            local[f["id"]] = registrar(f, f"{ctx} fuente {f['id']}")

        def refs(ids, c2):
            out = []
            for i in ids or []:
                if i not in local:
                    err(f"{c2}: fuente inexistente {i!r}")
                elif local[i]:
                    out.append(local[i])
            if not out:
                err(f"{c2}: sin fuentes")
            return list(dict.fromkeys(out))

        for d in o.get("delitos", []):
            if d not in DEL:
                err(f"{ctx}: delito inválido {d!r}")

        presencia = []
        vistos = set()
        delitos_pres = set()
        for p in o.get("presencia", []):
            c2 = f"{ctx} presencia {p.get('pais')}"
            if p["pais"] not in nombres:
                err(f"{c2}: país desconocido")
            if p["pais"] in vistos:
                err(f"{c2}: país repetido")
            vistos.add(p["pais"])
            usados.add(p["pais"])
            if p["nivel"] not in NIV:
                err(f"{c2}: nivel inválido {p['nivel']!r}")
            if p.get("confianza") not in CONF:
                err(f"{c2}: confianza inválida")
            for d in p.get("delitos", []):
                if d not in DEL:
                    err(f"{c2}: delito inválido {d!r}")
            delitos_pres.update(p.get("delitos", []))
            presencia.append({
                "pais": p["pais"], "nivel": p["nivel"], "zonas": p.get("zonas", []),
                "delitos": [d for d in tax_orden(tax, p.get("delitos", []))],
                "nota": p.get("nota", ""), "confianza": p["confianza"],
                "_f": refs(p.get("fuente_ids"), c2),
            })
        if o.get("pais_origen") not in vistos:
            err(f"{ctx}: el país de origen no figura en la presencia")
        faltan = delitos_pres - set(o.get("delitos", []))
        if faltan:
            aviso(f"{ctx}: delitos presentes por país pero ausentes del total: {sorted(faltan)} (se agregan)")
        delitos_tot = tax_orden(tax, set(o.get("delitos", [])) | delitos_pres)

        lideres = [{
            "nombre": l["nombre"], "alias": l.get("alias", ""), "rol": l["rol"], "estado": l["estado"],
            "_f": refs(l.get("fuente_ids"), f"{ctx} líder {l['nombre']}"),
        } for l in o.get("lideres", [])]
        designaciones = [{
            "autoridad": d["autoridad"], "categoria": d["categoria"], "fecha": d.get("fecha", ""),
            "_f": refs(d.get("fuente_ids"), f"{ctx} designación {d['autoridad']}"),
        } for d in o.get("designaciones", [])]

        for v in o.get("vinculos", []):
            c2 = f"{ctx} vínculo {v.get('destino')}/{v.get('tipo')}"
            if v["destino"] not in ids_org and v["destino"] not in ids_ext:
                err(f"{c2}: destino desconocido")
                continue
            if v["destino"] == o["id"]:
                err(f"{c2}: vínculo consigo misma")
                continue
            if v["tipo"] not in VIN:
                err(f"{c2}: tipo inválido")
            if v.get("confianza") not in CONF:
                err(f"{c2}: confianza inválida")
            desde = v.get("desde")
            if desde and desde not in (o["id"], v["destino"]):
                err(f"{c2}: 'desde' debe ser {o['id']} o {v['destino']}")
            vinc_raw.append({
                "org": o["id"], "otro": v["destino"], "tipo": v["tipo"], "desde": desde,
                "texto": v.get("descripcion", "").strip(), "vigencia": v.get("vigencia", "vigente"),
                "confianza": v.get("confianza", "media"), "_f": refs(v.get("fuente_ids"), c2),
            })

        orgs.append({
            "id": o["id"], "nombre": o["nombre"], "corto": o["corto"], "alias": o.get("alias", []),
            "tipo": o["tipo"], "familia": TIPOS.get(o["tipo"], "narco"), "pais_origen": o["pais_origen"],
            "fundacion": o.get("fundacion", ""), "resumen": o["resumen"],
            "situacion_actual": o["situacion_actual"], "estructura": o.get("estructura", ""),
            "lideres": lideres, "designaciones": designaciones, "delitos": delitos_tot,
            "presencia": presencia, "notas_controversia": o.get("notas_controversia", ""),
            "confianza_general": o["confianza_general"],
        })

    # ---- Fusión de vínculos ----
    fusion = {}
    for v in vinc_raw:
        a, b = v["org"], v["otro"]
        dirigido = v["tipo"] in DIRIGIDOS and v["desde"]
        if dirigido:
            a, b = (v["desde"], b if v["desde"] == a else a)
        else:
            a, b = sorted((a, b))
        clave = (min(a, b), max(a, b), v["tipo"])
        r = fusion.get(clave)
        if r is None:
            r = fusion[clave] = {"a": a, "b": b, "tipo": v["tipo"], "dir": bool(dirigido), "textos": [],
                                 "vigencia": v["vigencia"], "confianza": v["confianza"], "_f": []}
        elif dirigido:
            if r["dir"] and (r["a"], r["b"]) != (a, b):
                aviso(f"vínculo {clave}: direcciones contradictorias; se marca sin dirección")
                r["dir"] = False
            elif not r["dir"]:
                r.update(a=a, b=b, dir=True)
        if v["texto"] and v["texto"] not in [t["t"] for t in r["textos"]]:
            r["textos"].append({"de": v["org"], "t": v["texto"]})
        if CONF_ORDEN[v["confianza"]] > CONF_ORDEN[r["confianza"]]:
            r["confianza"] = v["confianza"]
        if v["vigencia"] == "vigente":
            r["vigencia"] = "vigente"
        r["_f"] = list(dict.fromkeys(r["_f"] + v["_f"]))
    vinculos = list(fusion.values())
    for v in vinculos:
        if v["a"] in ids_ext and v["b"] in ids_ext:
            err(f"vínculo entre dos externos: {v['a']}–{v['b']}")
    for e in externos:
        if not any(e["id"] in (v["a"], v["b"]) for v in vinculos):
            aviso(f"externo {e['id']} sin vínculos")
        usados.add(e["pais"])

    # ---- Ids globales de fuentes ----
    claves_usadas = []
    def recolectar(lst):
        claves_usadas.extend(lst)
    for o in orgs:
        for p in o["presencia"]:
            recolectar(p["_f"])
        for l in o["lideres"]:
            recolectar(l["_f"])
        for d in o["designaciones"]:
            recolectar(d["_f"])
    for v in vinculos:
        recolectar(v["_f"])
    for e in externos:
        recolectar(e["_f"])
    orden = sorted(set(claves_usadas))
    gid = {k: f"f{i + 1:03d}" for i, k in enumerate(orden)}
    no_citadas = set(registro) - set(orden)
    if no_citadas:
        aviso(f"{len(no_citadas)} fuentes declaradas sin citar (se omiten)")

    def mapear(obj):
        obj["f"] = [gid[k] for k in obj.pop("_f")]
    for o in orgs:
        for coleccion in (o["presencia"], o["lideres"], o["designaciones"]):
            for x in coleccion:
                mapear(x)
    for v in vinculos:
        mapear(v)
    for e in externos:
        mapear(e)
    fuentes = {gid[k]: registro[k] for k in orden}

    sin_region = sorted(c for c in usados if c and c not in REGION_DE)
    if sin_region:
        err(f"países sin región asignada en tools/build.py: {sin_region}")
    latam = {c for rid, _, es_latam, cs in REGIONES if es_latam for c in cs.split()}
    paises = {}
    for c in sorted((usados | latam) & set(nombres)):
        paises[c] = {"n": nombres[c], "r": REGION_DE.get(c, "asi"), "latam": c in latam}

    for a in avisos:
        print("AVISO:", a)
    if errores:
        for e in errores:
            print("ERROR:", e)
        print(f"{len(errores)} errores. No se generó {SALIDA}.")
        return 1

    atlas = {
        "meta": {"corte": CORTE},
        "tax": tax,
        "regiones": [{"id": rid, "nombre": n, "latam": l} for rid, n, l, _ in REGIONES],
        "paises": paises,
        "orgs": sorted(orgs, key=lambda o: o["nombre"]),
        "externos": externos,
        "vinculos": sorted(vinculos, key=lambda v: (v["a"], v["b"], v["tipo"])),
        "fuentes": fuentes,
    }
    print(f"OK: {len(orgs)} organizaciones · {len(externos)} externos · {len(vinculos)} vínculos · "
          f"{len(fuentes)} fuentes · {len(paises)} países")
    if solo_validar:
        return 0
    SALIDA.write_text(
        "/* Generado por tools/build.py a partir de data/src. No editar a mano. */\n"
        "window.ATLAS = " + json.dumps(atlas, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Escrito {SALIDA} ({SALIDA.stat().st_size // 1024} KB)")
    return 0


def tax_orden(tax, codigos):
    orden = [d["id"] for d in tax["delitos"]]
    return [c for c in orden if c in set(codigos)]


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
