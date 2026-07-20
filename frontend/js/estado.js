// Estado compartido de la vista pública + bus de eventos mínimo.
// Sin librerías: EventTarget nativo alcanza para esta escala.

export const estado = {
  /** @type {Array<object>} todos los casos aprobados (del backend) */
  casos: [],
  /** @type {Map<string, object>} id de categoría → {nombre, color_hex, icono, casos} */
  categorias: new Map(),
  /** @type {Array<string>} nombres de municipios (del GeoJSON de límites) */
  municipios: [],
  filtros: {
    categoria: '',
    municipio: '',
    mes: '', // 'AAAA-MM' derivado de las fechas de ocurrencia
    desde: '',
    hasta: '',
    actor: '',
    texto: ''
  },
  /** casos que pasan los filtros actuales */
  casosFiltrados: []
};

export const bus = new EventTarget();

export function emitir(nombre, detalle) {
  bus.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
}

export function aplicarFiltros() {
  const f = estado.filtros;
  const texto = f.texto.trim().toLowerCase();
  const actor = f.actor.trim().toLowerCase();

  estado.casosFiltrados = estado.casos.filter((c) => {
    if (f.categoria && c.categoria_id !== f.categoria) return false;
    if (f.municipio && c.municipio !== f.municipio) return false;
    const fecha = c.fecha_ocurrencia || (c.creado_en || '').slice(0, 10);
    if (f.mes && fecha.slice(0, 7) !== f.mes) return false;
    if (f.desde && fecha && fecha < f.desde) return false;
    if (f.hasta && fecha && fecha > f.hasta) return false;
    if (actor && !(c.actores_involucrados || '').toLowerCase().includes(actor)) return false;
    if (texto) {
      const pajar = `${c.nombre_problematica} ${c.descripcion}`.toLowerCase();
      if (!pajar.includes(texto)) return false;
    }
    return true;
  });

  emitir('filtros-cambiados');
}
