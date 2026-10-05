# Atlas Criminal de América Latina

Sitio interactivo y estático que despliega las principales organizaciones criminales vigentes en América Latina y el Caribe: su presencia territorial (país y zonas clave), los delitos que ejecutan en cada territorio y sus vínculos regionales y extrarregionales. Cada afirmación cita sus fuentes.

Fecha de corte de los datos: **5 de octubre de 2026**. El atlas describe la situación a esa fecha; no incluye línea de tiempo.

## Vistas

| Vista | Qué muestra |
|---|---|
| Mapa de presencia | Número de organizaciones por país o, al elegir una organización, su nivel de presencia en cada país y las líneas desde su país de origen. Encuadre regional o mundial. |
| Red de vínculos | Grafo de alianzas, suministro, lavado, rivalidades y escisiones, incluidos actores extrarregionales ('Ndrangheta, redes balcánicas, redes chinas de lavado, etc.). Incluye la tabla equivalente. |
| Delitos × territorio | Matriz país × delito con el número de organizaciones que ejecutan cada delito en cada país. |
| Organizaciones | Fichas con resumen, situación actual, liderazgo presunto, designaciones oficiales, presencia, vínculos, controversias y fuentes numeradas. |
| Método y fuentes | Criterios, definiciones, límites y bibliografía completa. |

Los filtros (familia de organización, delito y organización) gobiernan todas las vistas.

## Uso local (Windows 11)

1. Descargue o clone el repositorio.
2. Abra `index.html` con doble clic. No requiere servidor ni conexión: d3, topojson, la geometría y los datos están incluidos en el repositorio. Sin conexión, las tipografías recurren a las del sistema.

Alternativa con servidor local (PowerShell, desde la carpeta del repositorio):

```powershell
python -m http.server 8000
# luego abra http://localhost:8000
```

## Publicación en GitHub Pages

En el repositorio: *Settings → Pages → Build and deployment → Source: Deploy from a branch*, rama deseada y carpeta `/ (root)`. El sitio no requiere compilación.

## Estructura

```
index.html                 página
assets/app.css             estilos (tema claro y oscuro)
assets/app.js              lógica de las vistas
assets/vendor/             d3 7.9.0 y topojson 3.0.2 (copias locales)
data/geo.js                geometría mundial (Natural Earth 1:50m, vía world-atlas 2.0.2)
data/atlas.js              datos compilados (generado; no editar a mano)
data/src/taxonomia.json    delitos, niveles de presencia, tipos de vínculo y de organización
data/src/paises.json       nombres de países en español (ISO 3166-1 alfa-3)
data/src/externos.json     actores fuera del catálogo con vínculos documentados
data/src/orgs/<id>.json    una ficha por organización (fuente de verdad)
tools/build.py             valida data/src y genera data/atlas.js
tools/build_geo.py         regenera data/geo.js y data/src/paises.json
tools/build_artifact.py    genera dist/atlas-artifact.html (versión de una sola página)
```

## Actualizar los datos

1. Edite o agregue fichas en `data/src/orgs/`. Cada presencia, vínculo, líder y designación debe citar al menos una fuente de la lista `fuentes` de la misma ficha.
2. Ejecute `python3 tools/build.py`. El script valida códigos de país, delitos, niveles, vínculos y fuentes; si hay errores, no genera el archivo.
3. Recargue `index.html`.

Para un vínculo dirigido (suministro o escisión) indique `"desde": "<id>"` con el id del proveedor o de la organización madre.

## Criterios de evidencia

- Jerarquía de fuentes: oficiales (UNODC, Europol, gobiernos, fiscalías, Departamento de Estado, Tesoro y Departamento de Justicia de EE. UU.), investigación especializada (InSight Crime, Global Initiative Against Transnational Organized Crime, International Crisis Group, centros académicos), prensa de referencia y literatura académica. Se excluyen enciclopedias abiertas, blogs y medios sin autoría.
- Confianza **alta**: una fuente oficial o dos independientes. **Media**: una fuente confiable. **Baja**: reportes no corroborados o disputados.
- Las personas se mencionan como presuntos responsables según acusaciones, sanciones o declaraciones oficiales.
- Las designaciones oficiales se informan como hechos jurídicos de cada Estado, sin adoptar su calificación.

## Límites

La ausencia de registro no prueba la ausencia de una organización. La presencia extrarregional suele corresponder a emisarios, socios o redes de lavado, no a control territorial. El cuadro puede cambiar con rapidez después de la fecha de corte.
