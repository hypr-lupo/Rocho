/* Atlas Criminal de América Latina — lógica de la interfaz.
   Datos: window.ATLAS (data/atlas.js, generado por tools/build.py) y window.ATLAS_GEO (data/geo.js).
   Todo texto proveniente de los datos se inserta con textContent; los enlaces solo admiten http(s). */
(function () {
  'use strict';

  const A = window.ATLAS;
  const GEO = window.ATLAS_GEO;
  if (!A || !GEO || !window.d3 || !window.topojson) {
    document.getElementById('main').textContent =
      'No se pudieron cargar los datos o las bibliotecas del atlas. Verifique que las carpetas data/ y assets/vendor/ estén junto a index.html.';
    return;
  }

  /* ---------------- Utilidades ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'style') n.style.cssText = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return n;
  }

  function fill(node, ...kids) {
    node.replaceChildren(
      ...kids
        .flat(Infinity)
        .filter((c) => c != null && c !== false)
        .map((c) => (c instanceof Node ? c : document.createTextNode(String(c))))
    );
    return node;
  }

  function safeUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
    } catch (e) {
      return null;
    }
  }

  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  function fmtFecha(f) {
    if (!f) return 's. f.';
    const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(f);
    if (!m) return f;
    const [, y, mo, d] = m;
    if (d) return `${+d} ${MESES[+mo - 1]} ${y}`;
    if (mo) return `${MESES[+mo - 1]} ${y}`;
    return y;
  }

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) {
      return null;
    }
    return null;
  }

  /* ---------------- Índices ---------------- */
  const T = A.tax;
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const DEL = byId(T.delitos);
  const NIV = byId(T.niveles);
  const VIN = byId(T.vinculos);
  const TIPO = byId(T.tipos);
  const FAM = byId(T.familias);
  const CONF = byId(T.confianza);
  const ORG = byId(A.orgs);
  const EXT = byId(A.externos);
  const NIV_ORD = { base: 0, consolidada: 1, operativa: 2, limitada: 3 };
  const pais = (a3) => (A.paises[a3] && A.paises[a3].n) || a3;
  const nodeName = (id) => (ORG[id] ? ORG[id].nombre : EXT[id] ? EXT[id].nombre : id);
  const nodeShort = (id) => (ORG[id] ? ORG[id].corto : EXT[id] ? EXT[id].corto : id);

  // Vínculos por nodo
  const VINC_DE = {};
  A.vinculos.forEach((v, i) => {
    v.i = i;
    (VINC_DE[v.a] = VINC_DE[v.a] || []).push(v);
    (VINC_DE[v.b] = VINC_DE[v.b] || []).push(v);
  });

  /* ---------------- Estado ---------------- */
  const state = {
    view: 'mapa',
    familia: 'todas',
    delito: '',
    org: '',
    extent: 'region',
    msort: 'region',
    csort: 'nombre',
    q: '',
    edges: Object.fromEntries(T.vinculos.map((v) => [v.id, true])),
    ext: true,
  };

  const orgPasa = (o) =>
    (state.familia === 'todas' || o.familia === state.familia) &&
    (!state.delito || o.delitos.includes(state.delito));

  // Presencias que cumplen los filtros (familia + delito en ese país).
  function presencias() {
    const out = [];
    for (const o of A.orgs) {
      if (state.familia !== 'todas' && o.familia !== state.familia) continue;
      for (const p of o.presencia) {
        if (state.delito && !p.delitos.includes(state.delito)) continue;
        out.push({ o, p });
      }
    }
    return out;
  }

  /* ---------------- Tooltip ---------------- */
  const tipEl = $('#tip');
  const tip = {
    show(ev, nodes) {
      fill(tipEl, nodes);
      tipEl.hidden = false;
      this.move(ev);
    },
    move(ev) {
      if (tipEl.hidden) return;
      const pad = 14;
      const r = tipEl.getBoundingClientRect();
      let x = (ev.clientX || 0) + pad;
      let y = (ev.clientY || 0) + pad;
      if (ev.clientX === undefined && ev.target && ev.target.getBoundingClientRect) {
        const b = ev.target.getBoundingClientRect();
        x = b.right + 6;
        y = b.top;
      }
      if (x + r.width > window.innerWidth - 8) x = Math.max(8, (ev.clientX || x) - r.width - pad);
      if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    },
    hide() {
      tipEl.hidden = true;
    },
  };

  /* ---------------- Citas ---------------- */
  function Citer() {
    const order = [];
    const pos = {};
    return {
      ref(ids) {
        return (ids || [])
          .filter((g) => A.fuentes[g])
          .map((g) => {
            if (!(g in pos)) {
              order.push(g);
              pos[g] = order.length;
            }
            const n = pos[g];
            const f = A.fuentes[g];
            return h('a', {
              class: 'cite',
              href: '#',
              title: `${f.editor}: ${f.titulo}`,
              'aria-label': `Fuente ${n}`,
              onclick: (e) => {
                e.preventDefault();
                const li = document.getElementById(`src-${n}`);
                if (li) {
                  li.scrollIntoView({ block: 'center' });
                  li.setAttribute('tabindex', '-1');
                  li.focus({ preventScroll: true });
                }
              },
              text: `[${n}]`,
            });
          });
      },
      list() {
        return h(
          'ol',
          { class: 'sources' },
          order.map((g, i) => {
            const f = A.fuentes[g];
            const url = safeUrl(f.url);
            return h(
              'li',
              { id: `src-${i + 1}` },
              url
                ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: f.titulo })
                : f.titulo,
              h('span', { class: 'src-meta', text: ` — ${f.editor}, ${fmtFecha(f.fecha)} · ${CAT_NOMBRE[f.cat] || f.cat}` }),
              f.ver ? null : h('span', { class: 'badge-unv', text: ' · enlace no verificado' })
            );
          })
        );
      },
      size: () => order.length,
    };
  }
  const CAT_NOMBRE = { oficial: 'Oficial', investigacion: 'Investigación especializada', prensa: 'Prensa', academica: 'Académica' };

  /* ---------------- Encabezado ---------------- */
  function initHeader() {
    const corte = $('#corte');
    corte.textContent = fmtFecha(A.meta.corte);
    corte.setAttribute('datetime', A.meta.corte);
    const paisesSet = new Set();
    A.orgs.forEach((o) => o.presencia.forEach((p) => paisesSet.add(p.pais)));
    const tally = $('#tally');
    const item = (v, l) => h('div', null, h('dt', { text: l }), h('dd', { text: String(v) }));
    fill(tally, 
      item(A.orgs.length, 'organizaciones'),
      item(paisesSet.size, 'países con presencia'),
      item(A.vinculos.length, 'vínculos'),
      item(Object.keys(A.fuentes).length, 'fuentes')
    );

    const btn = $('#theme');
    const modos = ['sistema', 'claro', 'oscuro'];
    const aplicar = (m) => {
      const root = document.documentElement;
      if (m === 'claro') root.setAttribute('data-theme', 'light');
      else if (m === 'oscuro') root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
      btn.textContent = `Tema: ${m}`;
    };
    let modo = store('atlas-tema') || 'sistema';
    if (!modos.includes(modo)) modo = 'sistema';
    aplicar(modo);
    btn.addEventListener('click', () => {
      modo = modos[(modos.indexOf(modo) + 1) % modos.length];
      store('atlas-tema', modo);
      aplicar(modo);
    });
  }

  /* ---------------- Filtros ---------------- */
  function initFilters() {
    const seg = $('#f-familia');
    const opts = [{ id: 'todas', nombre: 'Todas' }].concat(
      T.familias.map((f) => ({ id: f.id, nombre: FAMILIA_CORTA[f.id] || f.nombre }))
    );
    opts.forEach((f) => {
      seg.append(
        h(
          'button',
          {
            type: 'button',
            'data-fam': f.id,
            'aria-pressed': String(state.familia === f.id),
            title: FAM[f.id] ? FAM[f.id].nombre : 'Todas las familias',
            onclick: () => {
              state.familia = f.id;
              update();
            },
          },
          f.id !== 'todas' ? h('span', { class: `dot dot--${f.id}`, 'aria-hidden': 'true' }) : null,
          f.nombre
        )
      );
    });

    const sd = $('#f-delito');
    sd.append(h('option', { value: '', text: 'Todos los delitos' }));
    T.delitos.forEach((d) => sd.append(h('option', { value: d.id, text: d.nombre })));
    sd.addEventListener('change', () => {
      state.delito = sd.value;
      update();
    });

    const so = $('#f-org');
    so.append(h('option', { value: '', text: 'Todas las organizaciones' }));
    T.familias.forEach((f) => {
      const g = h('optgroup', { label: f.nombre });
      A.orgs
        .filter((o) => o.familia === f.id)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .forEach((o) => g.append(h('option', { value: o.id, text: o.nombre })));
      so.append(g);
    });
    so.addEventListener('change', () => {
      state.org = so.value;
      update();
    });

    $('#f-limpiar').addEventListener('click', () => {
      state.familia = 'todas';
      state.delito = '';
      state.org = '';
      update();
    });
  }
  const FAMILIA_CORTA = { narco: 'Narcotráfico', faccion: 'Facciones y pandillas', armado: 'Grupos armados' };

  function syncFilters() {
    $$('#f-familia button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fam === state.familia)));
    $('#f-delito').value = state.delito;
    $('#f-org').value = state.org;
    const activo = state.familia !== 'todas' || state.delito || state.org;
    $('#f-limpiar').hidden = !activo;
    const n = A.orgs.filter(orgPasa).length;
    const partes = [];
    if (state.familia !== 'todas') partes.push(FAMILIA_CORTA[state.familia]);
    if (state.delito) partes.push(DEL[state.delito].nombre);
    $('#f-status').textContent = partes.length
      ? `${n} de ${A.orgs.length} organizaciones ${n === 1 ? "cumple" : "cumplen"} el filtro`
      : `${A.orgs.length} organizaciones`;
  }

  /* ---------------- Vistas ---------------- */
  const VIEWS = ['mapa', 'red', 'matriz', 'fichas', 'metodo'];
  function setView(v, push) {
    if (!VIEWS.includes(v)) v = 'mapa';
    state.view = v;
    VIEWS.forEach((x) => {
      $(`#view-${x}`).hidden = x !== v;
      const t = $(`#tab-${x}`);
      t.setAttribute('aria-selected', String(x === v));
      t.tabIndex = x === v ? 0 : -1;
    });
    if (push !== false) {
      try {
        history.replaceState(null, '', '#' + v);
      } catch (e) {
        /* file:// o marco restringido */
      }
    }
    render();
  }
  function initTabs() {
    const tabs = $$('.tab');
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => setView(t.dataset.view));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const j = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        tabs[j].focus();
        setView(tabs[j].dataset.view);
      });
    });
  }

  function update() {
    syncFilters();
    render();
  }
  function render() {
    tip.hide();
    if (state.view === 'mapa') Mapa.render();
    else if (state.view === 'red') Red.render();
    else if (state.view === 'matriz') Matriz.render();
    else if (state.view === 'fichas') Fichas.render();
    else if (state.view === 'metodo') Metodo.render();
  }

  /* ================= MAPA ================= */
  const MAP_BINS = [1, 2, 4, 7, 11]; // 1 · 2–3 · 4–6 · 7–10 · 11+
  const binCount = (v, bins) => {
    let k = 0;
    bins.forEach((b, i) => {
      if (v >= b) k = i + 1;
    });
    return k;
  };
  const binLabel = (bins, i) => {
    const lo = bins[i];
    const hi = bins[i + 1] ? bins[i + 1] - 1 : null;
    if (hi === null) return `${lo}+`;
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  };

  const Mapa = (function () {
    const svg = d3.select('#map');
    const root = svg.append('g');
    const gSphere = root.append('path').attr('class', 'sphere');
    const gGrat = root.append('path').attr('class', 'grat');
    const gCountries = root.append('g');
    const gArcs = root.append('g');
    const gMarks = root.append('g');
    const proj = d3.geoNaturalEarth1().rotate([20, 0]);
    const path = d3.geoPath(proj);
    const feats = topojson
      .feature(GEO, GEO.objects.countries)
      .features.filter((f) => f.id !== 'ATA');
    const FEAT = Object.fromEntries(feats.map((f) => [f.id, f]));
    const centro = {};
    function centroid(a3) {
      if (centro[a3]) return centro[a3];
      const f = FEAT[a3];
      if (!f) return null;
      let g = f.geometry;
      if (g.type === 'MultiPolygon') {
        let best = null;
        let area = -1;
        g.coordinates.forEach((c) => {
          const poly = { type: 'Polygon', coordinates: c };
          const ar = d3.geoArea(poly);
          if (ar > area) {
            area = ar;
            best = poly;
          }
        });
        g = best;
      }
      centro[a3] = d3.geoCentroid(g);
      return centro[a3];
    }
    const LATAM = {
      type: 'MultiPoint',
      coordinates: [
        [-117, 32.5], [-97, 27], [-80, 27], [-60, 18], [-34, -6],
        [-40, -23], [-55, -35], [-68, -55.5], [-76, -48], [-82, -5], [-92, 14], [-110, 22],
      ],
    };
    let W = 0;
    let Hh = 0;
    let k = 1;
    const zoom = d3
      .zoom()
      .scaleExtent([0.9, 24])
      .on('zoom', (e) => {
        root.attr('transform', e.transform);
        k = e.transform.k;
        gMarks.selectAll('circle').attr('r', 4.5 / k);
      });
    svg.call(zoom).on('dblclick.zoom', null);

    let paths;
    function layout() {
      const r = svg.node().getBoundingClientRect();
      if (!r.width) return false;
      W = r.width;
      Hh = r.height;
      svg.attr('viewBox', `0 0 ${W} ${Hh}`);
      proj.fitExtent([[8, 8], [W - 8, Hh - 8]], { type: 'Sphere' });
      gSphere.datum({ type: 'Sphere' }).attr('d', path);
      gGrat.datum(d3.geoGraticule10()).attr('d', path);
      paths = gCountries
        .selectAll('path')
        .data(feats, (d) => d.id)
        .join('path')
        .attr('class', 'country')
        .attr('d', path);
      return true;
    }
    function encuadre(tipo, animate) {
      let t;
      if (tipo === 'mundo') {
        t = d3.zoomIdentity;
      } else {
        const [[x0, y0], [x1, y1]] = path.bounds(LATAM);
        const s = Math.min(W / (x1 - x0), Hh / (y1 - y0)) * 0.94;
        t = d3.zoomIdentity
          .translate(W / 2, Hh / 2)
          .scale(s)
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      }
      (animate ? svg.transition().duration(500) : svg).call(zoom.transform, t);
    }
    let ready = false;
    function ensure() {
      if (!ready) {
        ready = layout();
        if (ready) encuadre(state.extent, false);
      }
      return ready;
    }
    let rT;
    window.addEventListener('resize', () => {
      clearTimeout(rT);
      rT = setTimeout(() => {
        if (state.view !== 'mapa') {
          ready = false;
          return;
        }
        ready = layout();
        encuadre(state.extent, false);
        render();
      }, 150);
    });
    $$('.map-controls [data-extent]').forEach((b) =>
      b.addEventListener('click', () => {
        state.extent = b.dataset.extent;
        $$('.map-controls [data-extent]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        encuadre(state.extent, true);
      })
    );
    $('#zoom-in').addEventListener('click', () => svg.transition().duration(250).call(zoom.scaleBy, 1.6));
    $('#zoom-out').addEventListener('click', () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6));

    function render() {
      if (!ensure()) return;
      const org = state.org ? ORG[state.org] : null;
      const side = $('#map-side');
      const legend = $('#map-legend');
      gArcs.selectAll('*').remove();
      gMarks.selectAll('*').remove();

      if (!org) {
        // Modo agregado: número de organizaciones por país
        const porPais = {};
        presencias().forEach(({ o, p }) => {
          (porPais[p.pais] = porPais[p.pais] || new Map()).set(o.id, p);
        });
        paths
          .classed('has', (d) => !!porPais[d.id])
          .attr('tabindex', (d) => (porPais[d.id] ? 0 : null))
          .attr('role', (d) => (porPais[d.id] ? 'button' : null))
          .attr('aria-label', (d) => (porPais[d.id] ? `${pais(d.id)}: ${pl(porPais[d.id].size, 'organización', 'organizaciones')}` : null))
          .style('fill', (d) => {
            const n = porPais[d.id] ? porPais[d.id].size : 0;
            return n ? `var(--seq-${binCount(n, MAP_BINS)})` : null;
          });
        bindCountry((d) => {
          const m = porPais[d.id];
          if (!m) return null;
          const lista = Array.from(m.keys()).map((id) => ORG[id].corto);
          return [
            h('strong', { text: pais(d.id) }),
            h('span', { class: 'tip__val', text: `${m.size} ` }),
            h('span', { text: m.size === 1 ? 'organización' : 'organizaciones' }),
            h('div', { class: 'tip__muted', text: lista.sort((a, b) => a.localeCompare(b, 'es')).join(', ') }),
          ];
        });
        $('#map-title').textContent = state.delito
          ? `Organizaciones que ejecutan ${DEL[state.delito].nombre.toLowerCase()}, por país`
          : 'Organizaciones con presencia documentada, por país';
        fill(legend, 
          h('span', { class: 'legend__title', text: 'Organizaciones por país' }),
          MAP_BINS.map((b, i) =>
            h('span', { class: 'legend__item' }, h('span', { class: 'swatch', style: `background:var(--seq-${i + 1})` }), binLabel(MAP_BINS, i))
          ),
          h('span', { class: 'legend__item' }, h('span', { class: 'swatch', style: 'background:var(--land)' }), 'Sin registro'),
          h('span', { class: 'legend__note', text: 'Arrastre para desplazar · rueda o botones para acercar' })
        );
        // Lista lateral (equivalente tabular del mapa)
        const filas = Object.entries(porPais)
          .map(([a3, m]) => ({ a3, n: m.size, m }))
          .sort((a, b) => b.n - a.n || pais(a.a3).localeCompare(pais(b.a3), 'es'));
        const max = filas.length ? filas[0].n : 1;
        const latam = filas.filter((f) => A.paises[f.a3] && A.paises[f.a3].latam);
        const otros = filas.filter((f) => !(A.paises[f.a3] && A.paises[f.a3].latam));
        const fila = (f) =>
          h(
            'li',
            null,
            h(
              'button',
              { type: 'button', onclick: () => Drawer.open({ kind: 'pais', id: f.a3 }) },
              h('span', { class: 'rank__name', text: pais(f.a3) }),
              h('span', { class: 'rank__val', text: String(f.n) }),
              h('span', { class: 'rank__bar', 'aria-hidden': 'true' }, h('span', { style: `width:${(f.n / max) * 100}%` }))
            )
          );
        fill(side, 
          h('h3', { text: 'Países por número de organizaciones' }),
          h('p', {
            class: 'side__sub',
            text: `${pl(filas.length, 'país', 'países')} con registro${state.familia !== 'todas' || state.delito ? ' según el filtro' : ''}. Seleccione uno para ver el detalle.`,
          }),
          h(
            'ul',
            { class: 'rank' },
            latam.length ? h('li', { class: 'rank-group', text: 'América Latina y el Caribe' }) : null,
            latam.map(fila),
            otros.length ? h('li', { class: 'rank-group', text: 'Fuera de la región' }) : null,
            otros.map(fila)
          )
        );
      } else {
        // Modo organización
        const pres = org.presencia.filter((p) => !state.delito || p.delitos.includes(state.delito));
        const P = Object.fromEntries(pres.map((p) => [p.pais, p]));
        paths
          .classed('has', (d) => !!P[d.id])
          .attr('tabindex', (d) => (P[d.id] ? 0 : null))
          .attr('role', (d) => (P[d.id] ? 'button' : null))
          .attr('aria-label', (d) => (P[d.id] ? `${pais(d.id)}: presencia ${NIV[P[d.id].nivel].nombre.toLowerCase()}` : null))
          .style('fill', (d) => (P[d.id] ? `var(--lvl-${P[d.id].nivel})` : null));
        bindCountry((d) => {
          const p = P[d.id];
          if (!p) return null;
          return [
            h('strong', { text: pais(d.id) }),
            h('span', { class: 'tip__val', text: `Presencia ${NIV[p.nivel].nombre.toLowerCase()}` }),
            p.zonas.length ? h('div', { text: `Zonas: ${p.zonas.slice(0, 6).join(', ')}${p.zonas.length > 6 ? '…' : ''}` }) : null,
            h('div', { class: 'tip__muted', text: p.delitos.map((x) => DEL[x].corto).join(' · ') }),
          ];
        });
        // Arcos desde el país de origen
        const o0 = centroid(org.pais_origen);
        if (o0) {
          const destinos = pres.filter((p) => p.pais !== org.pais_origen && centroid(p.pais));
          gArcs
            .selectAll('path')
            .data(destinos)
            .join('path')
            .attr('class', 'arc')
            .attr('d', (p) => path({ type: 'LineString', coordinates: [o0, centroid(p.pais)] }));
          const xy = proj(o0);
          if (xy) gMarks.append('circle').attr('class', 'origin').attr('cx', xy[0]).attr('cy', xy[1]).attr('r', 4.5 / k);
        }
        $('#map-title').textContent = `${org.nombre}: presencia${state.delito ? ' con ' + DEL[state.delito].nombre.toLowerCase() : ''}`;
        fill(legend, 
          h('span', { class: 'legend__title', text: 'Nivel de presencia' }),
          T.niveles.map((n) =>
            h('span', { class: 'legend__item', title: n.def }, h('span', { class: 'swatch', style: `background:var(--lvl-${n.id})` }), n.nombre)
          ),
          h('span', { class: 'legend__item' }, h('span', { class: 'swatch', style: 'background:var(--focus);border-radius:50%;width:12px' }), 'Origen'),
          h('span', { class: 'legend__note', text: 'Las líneas unen el país de origen con cada país de presencia' })
        );
        const grupos = T.niveles.map((n) => ({
          n,
          items: pres.filter((p) => p.nivel === n.id).sort((a, b) => pais(a.pais).localeCompare(pais(b.pais), 'es')),
        }));
        fill(side, 
          h('h3', { text: org.nombre }),
          h('p', { class: 'side__sub' }, `${pl(pres.length, 'país', 'países')} · `, h('button', { class: 'linkbtn', type: 'button', onclick: () => Drawer.open({ kind: 'org', id: org.id }), text: 'Abrir ficha' })),
          h(
            'ul',
            { class: 'rank' },
            grupos
              .filter((g) => g.items.length)
              .map((g) => [
                h('li', { class: 'rank-group', text: `${g.n.nombre} (${g.items.length})` }),
                g.items.map((p) =>
                  h(
                    'li',
                    null,
                    h(
                      'button',
                      { type: 'button', onclick: () => Drawer.open({ kind: 'pais', id: p.pais }) },
                      h('span', { class: 'rank__name', text: pais(p.pais) }),
                      h('span', { class: 'chip chip--lvl-' + p.nivel, text: NIV[p.nivel].nombre }),
                      p.zonas.length ? h('span', { class: 'rank__meta', text: p.zonas.slice(0, 4).join(', ') + (p.zonas.length > 4 ? '…' : '') }) : null
                    )
                  )
                ),
              ])
          )
        );
      }
    }
    function bindCountry(content) {
      paths
        .on('pointerenter', function (ev, d) {
          const c = content(d);
          if (!c) return;
          tip.show(ev, c);
        })
        .on('pointermove', (ev) => tip.move(ev))
        .on('pointerleave', () => tip.hide())
        .on('focus', function (ev, d) {
          const c = content(d);
          if (c) tip.show({ target: this }, c);
        })
        .on('blur', () => tip.hide())
        .on('click', (ev, d) => {
          if (content(d)) Drawer.open({ kind: 'pais', id: d.id });
        })
        .on('keydown', (ev, d) => {
          if ((ev.key === 'Enter' || ev.key === ' ') && content(d)) {
            ev.preventDefault();
            Drawer.open({ kind: 'pais', id: d.id });
          }
        });
    }
    return { render };
  })();

  /* ================= RED ================= */
  const Red = (function () {
    const svg = d3.select('#net');
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('class', 'arrow')
      .attr('d', 'M0,-4.5L10,0L0,4.5Z');
    const root = svg.append('g');
    const gE = root.append('g');
    const gH = root.append('g');
    const gN = root.append('g');
    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 5])
      .on('zoom', (e) => root.attr('transform', e.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    const pos = {}; // posiciones persistentes por id
    let sim = null;
    let rT;
    window.addEventListener('resize', () => {
      clearTimeout(rT);
      rT = setTimeout(() => {
        if (state.view === 'red') render();
      }, 200);
    });

    function legend() {
      const L = $('#net-legend');
      fill(L, 
        h('span', { class: 'legend__title', text: 'Nodos' }),
        T.familias.map((f) => h('span', { class: 'legend__item' }, h('span', { class: `dot dot--${f.id}` }), FAMILIA_CORTA[f.id])),
        h('span', { class: 'legend__item' }, h('span', { class: 'dot dot--ext' }), 'Actor fuera del catálogo'),
        h('span', { class: 'legend__title', text: 'Vínculos', style: 'margin-left:8px' }),
        T.vinculos.map((v) =>
          h(
            'button',
            {
              type: 'button',
              class: 'toggle',
              'aria-pressed': String(state.edges[v.id]),
              title: v.def,
              onclick: () => {
                state.edges[v.id] = !state.edges[v.id];
                render();
              },
            },
            edgeSample(v.id),
            v.nombre
          )
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'toggle',
            'aria-pressed': String(state.ext),
            onclick: () => {
              state.ext = !state.ext;
              render();
            },
          },
          h('span', { class: 'dot dot--ext', 'aria-hidden': 'true' }),
          'Actores fuera del catálogo'
        ),
        h('span', { class: 'legend__note', text: 'Nodos agrupados por región de origen · línea tenue: confianza baja' })
      );
    }
    function edgeSample(tipo) {
      const ns = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(ns, 'svg');
      s.setAttribute('class', 'legend-edge');
      s.setAttribute('viewBox', '0 0 30 10');
      s.setAttribute('aria-hidden', 'true');
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', '1');
      l.setAttribute('y1', '5');
      l.setAttribute('x2', tipo === 'suministro' ? '22' : '29');
      l.setAttribute('y2', '5');
      const dash = { rivalidad: '6 3', lavado: '1.5 3', escision: '7 2 2 2' }[tipo];
      if (dash) l.setAttribute('stroke-dasharray', dash);
      if (tipo === 'lavado') l.setAttribute('stroke-linecap', 'round');
      s.append(l);
      if (tipo === 'suministro') {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', 'M21,1.5L29,5L21,8.5Z');
        p.setAttribute('class', 'arrow');
        s.append(p);
      }
      return s;
    }

    // Anclas geográficas aproximadas: los nodos se agrupan por región de origen.
    const ANCLAS = {
      mex: [-260, -230], nam: [-260, -400], mca: [-60, -230], car: [260, -230],
      norandino: [0, 0], andes: [-230, 170], conosur: [80, 330], eur: [420, 60], afr: [420, 300], asi: [-520, -120],
    };
    function ancla(d) {
      const a3 = d.ext ? EXT[d.id].pais : ORG[d.id].pais_origen;
      const r = A.paises[a3] ? A.paises[a3].r : 'eur';
      let k = r;
      if (a3 === 'MEX') k = 'mex';
      else if (r === 'sud') k = ['COL', 'VEN'].includes(a3) ? 'norandino' : ['ECU', 'PER', 'BOL'].includes(a3) ? 'andes' : 'conosur';
      return ANCLAS[k] || [0, 0];
    }

    function datos() {
      const orgs = A.orgs.filter(orgPasa);
      const ids = new Set(orgs.map((o) => o.id));
      const links = A.vinculos.filter((v) => {
        if (!state.edges[v.tipo]) return false;
        if (!state.ext && (EXT[v.a] || EXT[v.b])) return false;
        const a = ids.has(v.a) || (EXT[v.a] && ids.has(v.b));
        const b = ids.has(v.b) || (EXT[v.b] && ids.has(v.a));
        return a && b;
      });
      const nodeIds = new Set(ids);
      links.forEach((v) => {
        nodeIds.add(v.a);
        nodeIds.add(v.b);
      });
      const grado = {};
      links.forEach((v) => {
        grado[v.a] = (grado[v.a] || 0) + 1;
        grado[v.b] = (grado[v.b] || 0) + 1;
      });
      const nodes = Array.from(nodeIds).map((id) => {
        const o = ORG[id];
        const n = {
          id,
          ext: !o,
          fam: o ? o.familia : 'ext',
          r: o ? 7 + Math.sqrt(o.presencia.length) * 2.2 : 6,
          label: nodeShort(id),
          grado: grado[id] || 0,
        };
        if (pos[id]) {
          n.x = pos[id].x;
          n.y = pos[id].y;
        }
        return n;
      });
      return { nodes, links: links.map((v) => ({ v, source: v.a, target: v.b })) };
    }

    function curva(l) {
      const s = l.source;
      const t = l.target;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const off = l.curv || 0;
      const cx = (s.x + t.x) / 2 + (-dy / d) * off;
      const cy = (s.y + t.y) / 2 + (dx / d) * off;
      let tx = t.x;
      let ty = t.y;
      if (l.v.dir) {
        const ex = t.x - cx;
        const ey = t.y - cy;
        const ed = Math.hypot(ex, ey) || 1;
        tx = t.x - (ex / ed) * (t.r + 4);
        ty = t.y - (ey / ed) * (t.r + 4);
      }
      return `M${s.x},${s.y}Q${cx},${cy} ${tx},${ty}`;
    }

    function render() {
      legend();
      const { nodes, links } = datos();
      // Curvatura para pares con varios vínculos
      const pares = {};
      links.forEach((l) => {
        const k = [l.source, l.target].sort().join('|');
        (pares[k] = pares[k] || []).push(l);
      });
      Object.values(pares).forEach((arr) =>
        arr.forEach((l, i) => {
          l.curv = arr.length > 1 ? (i - (arr.length - 1) / 2) * 26 : 0;
        })
      );
      if (sim) sim.stop();
      sim = d3
        .forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance((l) => (l.v.tipo === 'escision' ? 70 : 120)).strength(0.12))
        .force('charge', d3.forceManyBody().strength((d) => (d.ext ? -260 : -520)).distanceMax(420))
        .force('collide', d3.forceCollide().radius((d) => d.r + 10 + Math.min(d.label.length, 24) * 2.6).strength(0.9))
        .force('x', d3.forceX((d) => ancla(d)[0]).strength(0.28))
        .force('y', d3.forceY((d) => ancla(d)[1]).strength(0.3))
        .stop();
      const fresh = nodes.some((n) => n.x === undefined);
      if (!fresh) sim.alpha(0.2);
      for (let i = 0; i < (fresh ? 420 : 120); i++) sim.tick();
      nodes.forEach((n) => (pos[n.id] = { x: n.x, y: n.y }));

      // Encuadre: escala 1 si el contenido cabe; si no, reducir hasta que quepa.
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const x0 = Math.min(...xs, 0) - 40;
      const x1 = Math.max(...xs, 0) + 130;
      const y0 = Math.min(...ys, 0) - 30;
      const y1 = Math.max(...ys, 0) + 30;
      const box = svg.node().getBoundingClientRect();
      const W = box.width || 900;
      const Hh = box.height || 600;
      const s = Math.min(1, W / (x1 - x0), Hh / (y1 - y0));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      svg.attr('viewBox', `${cx - W / (2 * s)} ${cy - Hh / (2 * s)} ${W / s} ${Hh / s}`);

      const focus = state.org;
      const vecinos = new Set(focus ? [focus] : []);
      if (focus) links.forEach((l) => {
        if (l.source.id === focus) vecinos.add(l.target.id);
        if (l.target.id === focus) vecinos.add(l.source.id);
      });

      const edges = gE
        .selectAll('path')
        .data(links, (l) => l.v.i)
        .join('path')
        .attr('class', (l) => `edge edge--${l.v.tipo}${l.v.confianza === 'baja' ? ' edge--baja' : ''}`)
        .attr('marker-end', (l) => (l.v.dir ? 'url(#arrow)' : null))
        .attr('d', curva);
      const hits = gH
        .selectAll('path')
        .data(links, (l) => l.v.i)
        .join('path')
        .attr('class', 'edge-hit')
        .attr('d', curva)
        .on('pointerenter', (ev, l) => tip.show(ev, edgeTip(l.v)))
        .on('pointermove', (ev) => tip.move(ev))
        .on('pointerleave', () => tip.hide());

      const node = gN
        .selectAll('g.node')
        .data(nodes, (d) => d.id)
        .join((enter) => {
          const g = enter.append('g');
          g.append('circle').attr('class', 'hit');
          return g;
        })
        .attr('class', (d) => `node node--${d.fam}${d.id === focus ? ' is-focus' : ''}`)
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', (d) => `${nodeName(d.id)}: ${pl(d.grado, 'vínculo visible', 'vínculos visibles')}`)
        .attr('transform', (d) => `translate(${d.x},${d.y})`);
      node.selectAll('circle:not(.hit), rect, text').remove();
      node.select('circle.hit').attr('r', (d) => Math.max(14, d.r + 6));
      node
        .filter((d) => !d.ext)
        .append('circle')
        .attr('r', (d) => d.r);
      node
        .filter((d) => d.ext)
        .append('rect')
        .attr('x', -6)
        .attr('y', -6)
        .attr('width', 12)
        .attr('height', 12)
        .attr('transform', 'rotate(45)');
      node
        .append('text')
        .attr('x', (d) => d.r + 5)
        .attr('dy', '0.35em')
        .text((d) => d.label);

      const near = (id) => {
        const s = new Set([id]);
        links.forEach((l) => {
          if (l.source.id === id) s.add(l.target.id);
          if (l.target.id === id) s.add(l.source.id);
        });
        return s;
      };
      const dim = (set, centerId) => {
        svg.classed('is-dimmed', !!set);
        if (!set) return;
        node.classed('is-near', (d) => set.has(d.id));
        edges.classed('is-near', (l) => l.source.id === centerId || l.target.id === centerId);
      };
      const reposo = () => (focus ? dim(vecinos, focus) : dim(null));
      reposo();

      node
        .on('pointerenter', function (ev, d) {
          dim(near(d.id), d.id);
          tip.show(ev, nodeTip(d));
        })
        .on('pointermove', (ev) => tip.move(ev))
        .on('pointerleave', () => {
          tip.hide();
          reposo();
        })
        .on('focus', function (ev, d) {
          dim(near(d.id), d.id);
          tip.show({ target: this }, nodeTip(d));
        })
        .on('blur', () => {
          tip.hide();
          reposo();
        })
        .on('click', (ev, d) => {
          if (ev.defaultPrevented) return;
          Drawer.open({ kind: d.ext ? 'ext' : 'org', id: d.id });
        })
        .on('keydown', (ev, d) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            Drawer.open({ kind: d.ext ? 'ext' : 'org', id: d.id });
          }
        });

      const ticked = () => {
        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
        edges.attr('d', curva);
        hits.attr('d', curva);
      };
      node.call(
        d3
          .drag()
          .on('start', (ev, d) => {
            sim.alphaTarget(0.15).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on('end', (ev, d) => {
            sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
            pos[d.id] = { x: d.x, y: d.y };
          })
      );
      sim.on('tick', ticked);

      // Tabla equivalente
      const tabla = $('#net-table');
      const filas = links
        .map((l) => l.v)
        .sort((a, b) => nodeName(a.a).localeCompare(nodeName(b.a), 'es') || a.tipo.localeCompare(b.tipo));
      $('#net-count').textContent = `${pl(filas.length, 'vínculo', 'vínculos')} con los filtros actuales.`;
      fill(tabla, 
        h('thead', null, h('tr', null, ['Organización', 'Tipo', 'Contraparte', 'Descripción', 'Confianza', 'Fuentes'].map((t) => h('th', { scope: 'col', text: t })))),
        h(
          'tbody',
          null,
          filas.map((v) =>
            h(
              'tr',
              null,
              h('td', null, nodeLink(v.a)),
              h('td', { text: VIN[v.tipo].nombre + (v.dir ? ' →' : '') }),
              h('td', null, nodeLink(v.b)),
              h('td', null, v.textos.map((t) => h('div', { text: t.t }))),
              h('td', { text: CONF[v.confianza].nombre + (v.vigencia === 'incierta' ? ' · vigencia incierta' : '') }),
              h(
                'td',
                null,
                v.f.map((g, i) => {
                  const f = A.fuentes[g];
                  const url = f && safeUrl(f.url);
                  return url ? [i ? ', ' : '', h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', title: f.titulo, text: f.editor })] : null;
                })
              )
            )
          )
        )
      );
    }

    function nodeTip(d) {
      if (d.ext) {
        const e = EXT[d.id];
        return [h('strong', { text: e.nombre }), h('div', { class: 'tip__muted', text: `${pais(e.pais)} · ${pl(d.grado, 'vínculo visible', 'vínculos visibles')}` })];
      }
      const o = ORG[d.id];
      return [
        h('strong', { text: o.nombre }),
        h('div', { text: `${TIPO[o.tipo].nombre} · origen: ${pais(o.pais_origen)}` }),
        h('div', { class: 'tip__muted' }, h('span', { class: 'tip__val', text: String(d.grado) }), d.grado === 1 ? ' vínculo visible · ' : ' vínculos visibles · ', pl(o.presencia.length, 'país', 'países')),
      ];
    }
    function edgeTip(v) {
      return [
        h('strong', { text: `${nodeShort(v.a)} ${v.dir ? '→' : '·'} ${nodeShort(v.b)}` }),
        h('span', { class: 'tip__val', text: VIN[v.tipo].nombre }),
        v.textos.slice(0, 2).map((t) => h('div', { text: t.t })),
        h('div', { class: 'tip__muted', text: `Confianza ${CONF[v.confianza].nombre.toLowerCase()} · ${v.f.length} fuente${v.f.length === 1 ? '' : 's'}${v.vigencia === 'incierta' ? ' · vigencia incierta' : ''}` }),
      ];
    }
    return { render };
  })();

  function nodeLink(id) {
    return h('button', {
      type: 'button',
      class: 'linkbtn',
      onclick: () => Drawer.open({ kind: ORG[id] ? 'org' : 'ext', id }),
      text: nodeName(id),
    });
  }

  /* ================= MATRIZ ================= */
  const M_BINS = [1, 2, 4, 7, 10]; // 1 · 2–3 · 4–6 · 7–9 · 10+
  const Matriz = (function () {
    $$('#m-sort button').forEach((b) =>
      b.addEventListener('click', () => {
        state.msort = b.dataset.sort;
        $$('#m-sort button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        render();
      })
    );
    function render() {
      const orgs = A.orgs.filter((o) => state.familia === 'todas' || o.familia === state.familia);
      const celdas = {};
      const total = {};
      orgs.forEach((o) =>
        o.presencia.forEach((p) => {
          (total[p.pais] = total[p.pais] || new Set()).add(o.id);
          p.delitos.forEach((d) => {
            const k = p.pais + '|' + d;
            (celdas[k] = celdas[k] || []).push(o.id);
          });
        })
      );
      let paises = Object.keys(total);
      const tot = (a3) => total[a3].size;
      const porTotal = (a, b) => tot(b) - tot(a) || pais(a).localeCompare(pais(b), 'es');
      let grupos;
      if (state.msort === 'region') {
        grupos = A.regiones
          .map((r) => ({ r, items: paises.filter((a3) => (A.paises[a3] ? A.paises[a3].r : 'otr') === r.id).sort(porTotal) }))
          .filter((g) => g.items.length);
      } else {
        grupos = [{ r: null, items: paises.sort(porTotal) }];
      }
      const cols = T.delitos;
      const t = $('#matrix');
      const head = h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, h('span', { class: 'sr-only', text: 'País' })),
          cols.map((d) =>
            h(
              'th',
              { scope: 'col' },
              h('button', {
                class: 'col-h',
                type: 'button',
                title: `${d.nombre}: ${d.def}`,
                'aria-pressed': String(state.delito === d.id),
                text: d.corto,
                onclick: () => {
                  state.delito = state.delito === d.id ? '' : d.id;
                  update();
                },
              })
            )
          ),
          h('th', { scope: 'col', class: 'tot', text: 'Org.' })
        )
      );
      const body = h('tbody');
      grupos.forEach((g) => {
        if (g.r) body.append(h('tr', { class: 'grp' }, h('th', { colspan: cols.length + 2, scope: 'colgroup', text: g.r.nombre })));
        g.items.forEach((a3) => {
          body.append(
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, h('button', { class: 'row-h', type: 'button', text: pais(a3), onclick: () => Drawer.open({ kind: 'pais', id: a3 }) })),
              cols.map((d) => {
                const ids = celdas[a3 + '|' + d.id] || [];
                const v = ids.length;
                const cls = ['cell'];
                if (v) cls.push('cell--' + binCount(v, M_BINS));
                if (state.org && ids.includes(state.org)) cls.push('is-org');
                return h(
                  'td',
                  { class: state.delito === d.id ? 'col-on' : null },
                  h('button', {
                    type: 'button',
                    class: cls.join(' '),
                    'data-v': v ? String(v) : null,
                    disabled: v ? null : true,
                    'aria-label': `${pais(a3)}, ${d.nombre}: ${pl(v, 'organización', 'organizaciones')}`,
                    text: v ? String(v) : '',
                    onpointerenter: v
                      ? (ev) =>
                          tip.show(ev, [
                            h('strong', { text: `${pais(a3)} · ${d.nombre}` }),
                            h('span', { class: 'tip__val', text: `${v} ` }),
                            v === 1 ? 'organización' : 'organizaciones',
                            h('div', { class: 'tip__muted', text: ids.map((id) => ORG[id].corto).join(', ') }),
                          ])
                      : null,
                    onpointermove: v ? (ev) => tip.move(ev) : null,
                    onpointerleave: v ? () => tip.hide() : null,
                    onclick: v ? () => Drawer.open({ kind: 'celda', id: a3, delito: d.id }) : null,
                  })
                );
              }),
              h('td', { class: 'tot', text: String(tot(a3)) })
            )
          );
        });
      });
      fill(t, head, body);
      fill($('#m-legend'), 
        h('span', { class: 'legend__title', text: 'Organizaciones por celda' }),
        M_BINS.map((b, i) => h('span', { class: 'legend__item' }, h('span', { class: 'swatch', style: `background:var(--seq-${i + 1})` }), binLabel(M_BINS, i))),
        state.org ? h('span', { class: 'legend__item' }, h('span', { class: 'swatch', style: 'box-shadow:inset 0 0 0 2px var(--focus)' }), `Incluye a ${ORG[state.org].corto}`) : null
      );
    }
    return { render };
  })();

  /* ================= FICHAS ================= */
  const Fichas = (function () {
    $('#q').addEventListener('input', (e) => {
      state.q = e.target.value.trim().toLowerCase();
      render();
    });
    $$('#c-sort button').forEach((b) =>
      b.addEventListener('click', () => {
        state.csort = b.dataset.sort;
        $$('#c-sort button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        render();
      })
    );
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function render() {
      const q = norm(state.q);
      let orgs = A.orgs.filter(orgPasa).filter((o) => !q || norm([o.nombre, o.corto].concat(o.alias).join(' ')).includes(q));
      const nv = (o) => (VINC_DE[o.id] || []).length;
      if (state.csort === 'paises') orgs.sort((a, b) => b.presencia.length - a.presencia.length || a.nombre.localeCompare(b.nombre, 'es'));
      else if (state.csort === 'vinculos') orgs.sort((a, b) => nv(b) - nv(a) || a.nombre.localeCompare(b.nombre, 'es'));
      else orgs.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const box = $('#cards');
      if (!orgs.length) {
        fill(box, h('p', { text: 'Ninguna organización coincide con la búsqueda y los filtros actuales.' }));
        return;
      }
      fill(box, 
        ...orgs.map((o) =>
          h(
            'button',
            {
              type: 'button',
              class: 'card',
              style: state.org === o.id ? 'border-color:var(--focus);box-shadow:0 0 0 1px var(--focus)' : null,
              onclick: () => Drawer.open({ kind: 'org', id: o.id }),
            },
            h('span', { class: 'card__type' }, h('span', { class: `dot dot--${o.familia}`, 'aria-hidden': 'true' }), TIPO[o.tipo].nombre),
            h('h3', { text: o.nombre }),
            o.alias.length ? h('p', { class: 'card__alias', text: o.alias.slice(0, 3).join(' · ') }) : null,
            h(
              'span',
              { class: 'card__meta' },
              h('span', null, 'Origen: ', h('b', { text: pais(o.pais_origen) })),
              h('span', null, h('b', { text: String(o.presencia.length) }), o.presencia.length === 1 ? ' país' : ' países'),
              h('span', null, h('b', { text: String(nv(o)) }), nv(o) === 1 ? ' vínculo' : ' vínculos')
            ),
            h('p', { class: 'card__crimes', text: o.delitos.map((d) => DEL[d].corto).join(' · ') })
          )
        )
      );
    }
    return { render };
  })();

  /* ================= MÉTODO ================= */
  const Metodo = (function () {
    let hecho = false;
    function render() {
      if (hecho) return;
      hecho = true;
      const m = $('#metodo');
      fill(m, 
        h('h2', { text: 'Alcance' }),
        h('p', {
          text: `El atlas reúne ${A.orgs.length} organizaciones criminales latinoamericanas vigentes al ${fmtFecha(A.meta.corte)}: cárteles y redes de narcotráfico, facciones carcelarias, megabandas y pandillas transnacionales, y grupos armados cuyo origen es político o paramilitar pero que hoy dependen de economías ilícitas. Se seleccionaron por su alcance transnacional o por su impacto en la seguridad del país donde operan. No incluye una línea de tiempo: describe la situación a la fecha de corte.`,
        }),
        h('h2', { text: 'Fuentes y verificación' }),
        h('p', {
          text: 'Cada presencia, vínculo, líder y designación cita al menos una fuente. Se usaron cuatro categorías, en este orden de preferencia: fuentes oficiales (UNODC, Europol, gobiernos y fiscalías, Departamento de Estado, Tesoro y Departamento de Justicia de EE. UU.), investigación especializada (InSight Crime, Global Initiative Against Transnational Organized Crime, International Crisis Group, centros académicos y de seguridad), prensa de referencia y literatura académica. Se excluyeron enciclopedias abiertas, blogs y medios sin autoría.',
        }),
        h('p', {
          text: 'Los datos fueron recopilados por agentes de investigación con búsqueda web y luego sometidos a una revisión adversarial independiente que contrastó afirmaciones con sus fuentes y eliminó o rebajó las que no tenían respaldo. Las fuentes cuyo enlace no pudo abrirse durante la verificación aparecen marcadas como «enlace no verificado».',
        }),
        h('h2', { text: 'Niveles de presencia' }),
        h('dl', null, T.niveles.map((n) => [h('dt', null, h('span', { class: 'chip chip--lvl-' + n.id, text: n.nombre })), h('dd', { text: n.def })])),
        h('h2', { text: 'Grado de confianza' }),
        h('dl', null, T.confianza.map((c) => [h('dt', { text: c.nombre }), h('dd', { text: c.def })])),
        h('h2', { text: 'Tipos de vínculo' }),
        h('dl', null, T.vinculos.map((v) => [h('dt', { text: v.nombre }), h('dd', { text: v.def })])),
        h('h2', { text: 'Delitos' }),
        h('dl', null, T.delitos.map((d) => [h('dt', { text: d.nombre }), h('dd', { text: d.def })])),
        h('h2', { text: 'Límites' }),
        h(
          'ul',
          null,
          h('li', { text: 'La ausencia de registro en un país no prueba la ausencia de la organización; refleja lo que las fuentes abiertas documentan.' }),
          h('li', { text: 'La presencia extrarregional suele corresponder a emisarios, socios o redes de lavado, no a control territorial.' }),
          h('li', { text: 'Algunas categorías son objeto de controversia (por ejemplo, si una red de funcionarios constituye un cártel jerárquico). Las fichas lo señalan en «Controversias y advertencias».' }),
          h('li', { text: 'Las designaciones oficiales (por ejemplo, como organización terrorista) son actos políticos y jurídicos de cada Estado; se informan como hechos, sin adoptar su calificación.' }),
          h('li', { text: 'La mención de personas como líderes se basa en acusaciones, sanciones o declaraciones oficiales; se trata de presuntos responsables mientras no exista condena.' }),
          h('li', { text: 'El crimen organizado cambia con rapidez: capturas, muertes, escisiones y alianzas pueden alterar este cuadro después de la fecha de corte.' })
        ),
        h('h2', { text: 'Uso de los datos' }),
        h('p', null, 'Los datos fuente están en ', h('code', { text: 'data/src/orgs/*.json' }), ' (una ficha por organización) y se compilan con ', h('code', { text: 'python3 tools/build.py' }), ', que valida códigos de país, delitos, vínculos y fuentes antes de generar ', h('code', { text: 'data/atlas.js' }), '.')
      );
      // Bibliografía
      const fuentes = Object.entries(A.fuentes);
      const porCat = {};
      fuentes.forEach(([g, f]) => (porCat[f.cat] = porCat[f.cat] || []).push(f));
      $('#biblio-sum').textContent = `${fuentes.length} fuentes únicas. ${['oficial', 'investigacion', 'prensa', 'academica']
        .filter((c) => porCat[c])
        .map((c) => `${CAT_NOMBRE[c]}: ${porCat[c].length}`)
        .join(' · ')}.`;
      fill($('#biblio'), 
        ...['oficial', 'investigacion', 'prensa', 'academica']
          .filter((c) => porCat[c])
          .map((c) =>
            h(
              'section',
              { style: 'margin-bottom:18px' },
              h('h3', { text: CAT_NOMBRE[c], style: 'font-size:var(--fs-m);margin:0 0 8px' }),
              h(
                'ul',
                { class: 'biblio' },
                porCat[c]
                  .sort((a, b) => a.editor.localeCompare(b.editor, 'es') || (b.fecha || '').localeCompare(a.fecha || ''))
                  .map((f) => {
                    const url = safeUrl(f.url);
                    return h(
                      'li',
                      null,
                      url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: f.titulo }) : f.titulo,
                      h('div', { class: 'src-meta', text: `${f.editor} · ${fmtFecha(f.fecha)}${f.ver ? '' : ' · enlace no verificado'}` })
                    );
                  })
              )
            )
          )
      );
    }
    return { render };
  })();

  /* ================= PANEL LATERAL ================= */
  const Drawer = (function () {
    const el = $('#drawer');
    const body = $('#drawer-body');
    const crumb = $('#drawer-crumb');
    const back = $('#drawer-back');
    const pila = [];
    let actual = null;
    let previo = null;
    $('#drawer-close').addEventListener('click', close);
    back.addEventListener('click', () => {
      const p = pila.pop();
      if (p) show(p, false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.hidden) close();
    });
    function open(item) {
      if (el.hidden) {
        previo = document.activeElement;
        pila.length = 0;
      } else if (actual) pila.push(actual);
      show(item, true);
    }
    function show(item, foco) {
      actual = item;
      tip.hide();
      el.hidden = false;
      back.hidden = !pila.length;
      body.scrollTop = 0;
      if (item.kind === 'org') renderOrg(ORG[item.id]);
      else if (item.kind === 'pais') renderPais(item.id);
      else if (item.kind === 'celda') renderPais(item.id, item.delito);
      else if (item.kind === 'ext') renderExt(EXT[item.id]);
      if (foco) $('#drawer-close').focus();
    }
    function close() {
      el.hidden = true;
      actual = null;
      pila.length = 0;
      if (previo && document.contains(previo)) previo.focus();
    }

    function renderOrg(o) {
      const c = Citer();
      crumb.textContent = `Ficha · ${TIPO[o.tipo].nombre}`;
      const nodes = [];
      nodes.push(
        h('div', { class: 'card__type' }, h('span', { class: `dot dot--${o.familia}`, 'aria-hidden': 'true' }), `${FAM[o.familia].nombre} · ${TIPO[o.tipo].nombre}`),
        h('h2', { id: 'drawer-title', text: o.nombre }),
        o.alias.length ? h('p', { class: 'card__alias', text: `También: ${o.alias.join(' · ')}` }) : null,
        h(
          'dl',
          { class: 'facts' },
          h('dt', { text: 'Origen' }),
          h('dd', { text: `${pais(o.pais_origen)}${o.fundacion ? ' · ' + o.fundacion : ''}` }),
          h('dt', { text: 'Presencia' }),
          h('dd', { text: pl(o.presencia.length, 'país', 'países') }),
          h('dt', { text: 'Confianza general' }),
          h('dd', { text: CONF[o.confianza_general].nombre })
        ),
        h(
          'div',
          { class: 'chips', style: 'margin-top:12px' },
          h('button', { class: 'btn', type: 'button', onclick: () => focoEn(o.id, 'mapa'), text: 'Ver en el mapa' }),
          h('button', { class: 'btn', type: 'button', onclick: () => focoEn(o.id, 'red'), text: 'Ver en la red' }),
          h('button', { class: 'btn', type: 'button', onclick: () => focoEn(o.id, 'matriz'), text: 'Ver en la matriz' })
        ),
        h('h3', { text: 'Resumen' }),
        h('p', { text: o.resumen }),
        h('h3', { text: `Situación al ${fmtFecha(A.meta.corte)}` }),
        h('p', { text: o.situacion_actual })
      );
      if (o.estructura) nodes.push(h('h3', { text: 'Estructura' }), h('p', { text: o.estructura }));
      if (o.lideres.length)
        nodes.push(
          h('h3', { text: 'Liderazgo (presunto)' }),
          h(
            'ul',
            { class: 'leaders' },
            o.lideres.map((l) =>
              h('li', null, h('b', { text: l.nombre }), l.alias ? ` («${l.alias}»)` : '', ` — ${l.rol}. `, h('span', { style: 'color:var(--ink-2)', text: l.estado }), c.ref(l.f))
            )
          )
        );
      if (o.designaciones.length)
        nodes.push(
          h('h3', { text: 'Designaciones oficiales' }),
          h(
            'ul',
            { class: 'leaders' },
            o.designaciones.map((d) => h('li', null, h('b', { text: d.autoridad }), `: ${d.categoria}`, d.fecha ? ` (${fmtFecha(d.fecha)})` : '', c.ref(d.f)))
          )
        );
      nodes.push(
        h('h3', { text: 'Delitos documentados' }),
        h('div', { class: 'chips' }, o.delitos.map((d) => h('span', { class: 'chip', title: DEL[d].def, text: DEL[d].nombre })))
      );
      const pres = o.presencia.slice().sort((a, b) => NIV_ORD[a.nivel] - NIV_ORD[b.nivel] || pais(a.pais).localeCompare(pais(b.pais), 'es'));
      nodes.push(
        h('h3', { text: `Presencia territorial (${pres.length})` }),
        h(
          'ul',
          { class: 'pres' },
          pres.map((p) =>
            h(
              'li',
              null,
              h(
                'div',
                { class: 'pres__head' },
                h('button', { class: 'linkbtn pres__name', type: 'button', text: pais(p.pais), onclick: () => open({ kind: 'pais', id: p.pais }) }),
                h('span', { class: 'chip chip--lvl-' + p.nivel, text: NIV[p.nivel].nombre }),
                p.confianza !== 'alta' ? h('span', { class: 'chip chip--conf-' + p.confianza, text: `Confianza ${CONF[p.confianza].nombre.toLowerCase()}` }) : null,
                c.ref(p.f)
              ),
              p.zonas.length ? h('div', { class: 'pres__zones' }, h('b', { text: 'Zonas: ' }), p.zonas.join(', ')) : null,
              p.nota ? h('div', { class: 'pres__note', text: p.nota }) : null,
              p.delitos.length ? h('div', { class: 'chips' }, p.delitos.map((d) => h('span', { class: 'chip', title: DEL[d].nombre, text: DEL[d].corto }))) : null
            )
          )
        )
      );
      const vs = (VINC_DE[o.id] || []).slice().sort((a, b) => a.tipo.localeCompare(b.tipo) || nodeName(otro(a, o.id)).localeCompare(nodeName(otro(b, o.id)), 'es'));
      if (vs.length)
        nodes.push(
          h('h3', { text: `Vínculos (${vs.length})` }),
          h(
            'ul',
            { class: 'vinc' },
            vs.map((v) => {
              const yo = v.a === o.id;
              const flecha = v.dir ? (yo ? 'hacia' : 'desde') : 'con';
              return h(
                'li',
                null,
                h(
                  'div',
                  { class: 'vinc__head' },
                  h('span', { class: 'chip', text: VIN[v.tipo].nombre }),
                  h('span', { style: 'color:var(--muted);font-size:var(--fs-xs)', text: flecha }),
                  nodeLink(otro(v, o.id)),
                  v.confianza !== 'alta' ? h('span', { class: 'chip chip--conf-' + v.confianza, text: `Confianza ${CONF[v.confianza].nombre.toLowerCase()}` }) : null,
                  v.vigencia === 'incierta' ? h('span', { class: 'chip', text: 'Vigencia incierta' }) : null,
                  c.ref(v.f)
                ),
                v.textos.map((t) => h('div', { style: 'color:var(--ink-2)', text: t.t }))
              );
            })
          )
        );
      if (o.notas_controversia)
        nodes.push(h('h3', { text: 'Controversias y advertencias' }), h('div', { class: 'note-box', text: o.notas_controversia }));
      nodes.push(h('h3', { text: `Fuentes (${c.size()})` }), c.list());
      fill(body, nodes.filter(Boolean));
    }
    const otro = (v, id) => (v.a === id ? v.b : v.a);

    function renderPais(a3, delito) {
      const c = Citer();
      crumb.textContent = delito ? `País · ${DEL[delito].nombre}` : 'País';
      let filas = [];
      A.orgs.forEach((o) => {
        if (state.familia !== 'todas' && o.familia !== state.familia) return;
        o.presencia.forEach((p) => {
          if (p.pais !== a3) return;
          const d = delito || state.delito;
          if (d && !p.delitos.includes(d)) return;
          filas.push({ o, p });
        });
      });
      filas.sort((x, y) => NIV_ORD[x.p.nivel] - NIV_ORD[y.p.nivel] || x.o.nombre.localeCompare(y.o.nombre, 'es'));
      const delitosPais = {};
      filas.forEach(({ o, p }) => p.delitos.forEach((d) => (delitosPais[d] = delitosPais[d] || []).push(o.corto)));
      const filtro = [];
      if (state.familia !== 'todas') filtro.push(FAMILIA_CORTA[state.familia]);
      if (delito || state.delito) filtro.push(DEL[delito || state.delito].nombre);
      const reg = A.paises[a3] ? A.regiones.find((r) => r.id === A.paises[a3].r) : null;
      fill(body, 
        h('div', { class: 'card__type', text: reg ? reg.nombre : '' }),
        h('h2', { id: 'drawer-title', text: pais(a3) }),
        h('p', { style: 'color:var(--ink-2)' }, h('b', { text: String(filas.length) }), filas.length === 1 ? ' organización del atlas con presencia documentada' : ' organizaciones del atlas con presencia documentada', filtro.length ? ` (filtro: ${filtro.join(' · ')})` : '', '.'),
        filtro.length && !delito
          ? h('button', {
              class: 'btn',
              type: 'button',
              text: 'Ver sin filtros',
              onclick: () => {
                state.familia = 'todas';
                state.delito = '';
                update();
                show({ kind: 'pais', id: a3 }, false);
              },
            })
          : null,
        Object.keys(delitosPais).length
          ? [
              h('h3', { text: 'Delitos documentados en el país' }),
              h(
                'table',
                null,
                h('tbody', null,
                  T.delitos
                    .filter((d) => delitosPais[d.id])
                    .map((d) => h('tr', null, h('th', { scope: 'row', text: d.nombre, style: 'font-weight:600' }), h('td', { text: delitosPais[d.id].join(', ') })))
                )
              ),
            ]
          : null,
        h('h3', { text: 'Organizaciones presentes' }),
        h(
          'ul',
          { class: 'pres' },
          filas.map(({ o, p }) =>
            h(
              'li',
              null,
              h(
                'div',
                { class: 'pres__head' },
                h('span', { class: `dot dot--${o.familia}`, 'aria-hidden': 'true' }),
                h('button', { class: 'linkbtn pres__name', type: 'button', text: o.nombre, onclick: () => open({ kind: 'org', id: o.id }) }),
                h('span', { class: 'chip chip--lvl-' + p.nivel, text: NIV[p.nivel].nombre }),
                p.confianza !== 'alta' ? h('span', { class: 'chip chip--conf-' + p.confianza, text: `Confianza ${CONF[p.confianza].nombre.toLowerCase()}` }) : null,
                c.ref(p.f)
              ),
              p.zonas.length ? h('div', { class: 'pres__zones' }, h('b', { text: 'Zonas: ' }), p.zonas.join(', ')) : null,
              p.nota ? h('div', { class: 'pres__note', text: p.nota }) : null,
              h('div', { class: 'chips' }, p.delitos.map((d) => h('span', { class: 'chip', title: DEL[d].nombre, text: DEL[d].corto })))
            )
          )
        ),
        c.size() ? [h('h3', { text: `Fuentes (${c.size()})` }), c.list()] : null
      );
    }

    function renderExt(e) {
      const c = Citer();
      crumb.textContent = 'Actor externo';
      const vs = VINC_DE[e.id] || [];
      fill(body, 
        h('div', { class: 'card__type' }, h('span', { class: 'dot dot--ext', 'aria-hidden': 'true' }), 'Actor fuera del catálogo'),
        h('h2', { id: 'drawer-title', text: e.nombre }),
        h('dl', { class: 'facts' }, h('dt', { text: 'Base' }), h('dd', { text: pais(e.pais) })),
        h('p', { style: 'margin-top:10px' }, e.descripcion, c.ref(e.f)),
        h('h3', { text: `Vínculos con organizaciones del atlas (${vs.length})` }),
        h(
          'ul',
          { class: 'vinc' },
          vs.map((v) =>
            h(
              'li',
              null,
              h('div', { class: 'vinc__head' }, h('span', { class: 'chip', text: VIN[v.tipo].nombre }), nodeLink(otro(v, e.id)), c.ref(v.f)),
              v.textos.map((t) => h('div', { style: 'color:var(--ink-2)', text: t.t }))
            )
          )
        ),
        h('h3', { text: `Fuentes (${c.size()})` }),
        c.list()
      );
    }
    return { open, close };
  })();

  function focoEn(id, vista) {
    state.org = id;
    syncFilters();
    Drawer.close();
    setView(vista);
  }

  /* ---------------- Arranque ---------------- */
  function fromHash() {
    const t = (location.hash || '').slice(1);
    if (VIEWS.includes(t)) return setView(t, false);
    if (t.startsWith('o.') && ORG[t.slice(2)]) {
      setView('fichas', false);
      Drawer.open({ kind: 'org', id: t.slice(2) });
      return;
    }
    if (t.startsWith('p.') && A.paises[t.slice(2)]) {
      setView('mapa', false);
      Drawer.open({ kind: 'pais', id: t.slice(2) });
      return;
    }
    setView('mapa', false);
  }

  initHeader();
  initFilters();
  initTabs();
  syncFilters();
  fromHash();
  window.addEventListener('hashchange', () => {
    const t = (location.hash || '').slice(1);
    if (VIEWS.includes(t) && t !== state.view) setView(t, false);
  });
})();
