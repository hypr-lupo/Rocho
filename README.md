# Atlas Criminal de América Latina

Este atlas es un sitio web interactivo y estático (no necesita un servidor). Muestra las principales organizaciones criminales vigentes en América Latina y el Caribe. Para cada organización, muestra su presencia territorial (país y zonas clave), los delitos que comete en cada territorio y sus vínculos dentro y fuera de la región. Cada afirmación cita sus fuentes.

La fecha de corte de los datos es el 5 de octubre de 2026. El atlas describe la situación a esa fecha y no incluye una línea de tiempo.

## Vistas

| Vista | Qué muestra |
|---|---|
| Mapa de presencia | Muestra el número de organizaciones por país. Si elige una organización, muestra su nivel de presencia en cada país y las líneas desde su país de origen. El encuadre puede ser regional o mundial. |
| Red de vínculos | Muestra un diagrama de red con las alianzas, el suministro, el lavado, las rivalidades y las escisiones. Incluye actores de fuera de la región, por ejemplo la 'Ndrangheta, las redes balcánicas y las redes chinas de lavado. También incluye la tabla equivalente. |
| Delitos × territorio | Muestra una tabla de países y delitos. Cada celda indica el número de organizaciones que cometen ese delito en ese país. |
| Organizaciones | Muestra una ficha por organización. Cada ficha tiene resumen, situación actual, liderazgo presunto, designaciones oficiales, presencia, vínculos, controversias y fuentes numeradas. |
| Método y fuentes | Muestra los criterios, las definiciones, los límites y la bibliografía completa. |

Los filtros de familia de organización, de delito y de organización se aplican a todas las vistas.

## Uso local (Windows 11)

1. Descargue o clone el repositorio.
2. Haga doble clic en `index.html` para abrirlo en el navegador.

El sitio no necesita un servidor ni conexión a internet. El repositorio incluye d3, topojson, la geometría y los datos. Sin conexión, el sitio usa las tipografías del sistema.

Si prefiere usar un servidor local, siga estos pasos:

1. Abra PowerShell en la carpeta del repositorio.
2. Ejecute este comando:

   ```powershell
   python -m http.server 8000
   # luego abra http://localhost:8000
   ```

3. Abra `http://localhost:8000` en el navegador.

## Publicación en GitHub Pages

1. En el repositorio de GitHub, elija *Settings → Pages → Build and deployment → Source: Deploy from a branch*.
2. Elija la rama que desea publicar y la carpeta `/ (root)`.

El sitio no necesita compilación.

## Estructura

El repositorio tiene esta estructura:

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

El script `tools/build.py` genera `data/atlas.js` a partir de `data/src`. No edite `data/atlas.js` a mano. Si necesita cambiar los datos, edite los archivos de `data/src`.

## Actualizar los datos

1. Edite o agregue fichas en `data/src/orgs/`.

2. En cada presencia, vínculo, líder y designación, cite al menos una fuente de la lista `fuentes` de la misma ficha.

3. En un vínculo dirigido (suministro o escisión), indique `"desde": "<id>"` con el id del proveedor o de la organización madre.

4. Ejecute `python3 tools/build.py`. El script valida los códigos de país, los delitos, los niveles, los vínculos y las fuentes. Si hay errores, el script no genera el archivo.

5. Si el script informa errores, corrija los datos que indica. Después ejecute el script otra vez.

6. Recargue `index.html` en el navegador.

## Proceso de elaboración

La elaboración del atlas tuvo tres etapas:

1. En la etapa de investigación, agentes de investigación recopilaron cada ficha con fuentes abiertas (fuentes de acceso público). Los agentes abrieron cada URL citada.

2. En la etapa de verificación adversarial, verificadores independientes revisaron cada ficha con el supuesto de que tenía errores. Abrieron las fuentes y actualizaron los hechos de 2026 (detenciones, muertes, extradiciones, designaciones). También eliminaron o rebajaron lo que no tenía respaldo.

3. En la etapa de coherencia, un crítico contrastó todas las fichas entre sí. Sus hallazgos (contradicciones, vínculos faltantes, organizaciones omitidas) se integraron al atlas con una nueva verificación de fuentes. Así se incorporaron el Cártel de Juárez / La Línea y Gran Grif.

## Criterios de evidencia

El atlas usa cuatro tipos de fuentes, en este orden de preferencia:

1. Fuentes oficiales: la Oficina de las Naciones Unidas contra la Droga y el Delito (UNODC, por su sigla en inglés), Europol, gobiernos y fiscalías. Esta categoría también incluye el Departamento de Estado, el Tesoro y el Departamento de Justicia de EE. UU.

2. Investigación especializada: InSight Crime, Global Initiative Against Transnational Organized Crime, International Crisis Group y centros académicos.

3. Prensa de referencia.

4. Literatura académica.

El atlas excluye enciclopedias abiertas, blogs y medios sin autoría.

El atlas usa tres grados de confianza:

| Confianza | Respaldo |
|---|---|
| Alta | Una fuente oficial o dos fuentes independientes. |
| Media | Una fuente confiable. |
| Baja | Reportes no corroborados o disputados. |

El atlas menciona a las personas como presuntos responsables, según acusaciones, sanciones o declaraciones oficiales.

Una designación es la inclusión en un listado oficial de un Estado. El atlas informa cada designación como un hecho jurídico del Estado que la hizo, pero no adopta su calificación. El atlas registra la declaración conjunta «Escudo de las Américas» (22 de septiembre de 2026) como una declaración política no vinculante.

## Límites

Si el atlas no registra una organización en un lugar, eso no prueba que la organización esté ausente. La presencia fuera de la región suele corresponder a emisarios, socios o redes de lavado, no a control territorial. La situación puede cambiar con rapidez después de la fecha de corte.
