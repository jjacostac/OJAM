// Fila de filtros sobre el mapa + panel izquierdo de categorías
// (estructura de referencia: OCA UNAL).

import { estado, aplicarFiltros } from './estado.js';

const $ = (sel) => document.querySelector(sel);

export function initFiltros() {
  poblarSelectCategorias($('#f-categoria'));
  poblarSelectMunicipios($('#f-municipio'));
  poblarSelectMeses($('#f-mes'));
  pintarPanelCategorias();

  $('#form-filtros').addEventListener('submit', (e) => {
    e.preventDefault();
    leerYAplicar();
  });

  // Búsqueda avanzada: panel que se despliega desde la derecha por
  // encima de la interfaz. Lo abre la lupa de la fila de filtros.
  const btnLupa = $('#btn-lupa');
  const panelBusqueda = $('#panel-busqueda');
  const alternarBusqueda = (abrir) => {
    panelBusqueda.classList.toggle('abierto', abrir);
    btnLupa.setAttribute('aria-expanded', String(abrir));
    if (abrir) $('#f-desde').focus();
  };
  btnLupa.addEventListener('click', () =>
    alternarBusqueda(!panelBusqueda.classList.contains('abierto'))
  );
  $('#btn-cerrar-busqueda').addEventListener('click', () => {
    alternarBusqueda(false);
    btnLupa.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelBusqueda.classList.contains('abierto')) {
      alternarBusqueda(false);
      btnLupa.focus();
    }
  });
  $('#btn-aplicar-busqueda').addEventListener('click', () => {
    leerYAplicar();
    alternarBusqueda(false);
  });

  $('#btn-limpiar').addEventListener('click', () => {
    $('#form-filtros').reset();
    // Los campos del panel viven fuera del formulario: se limpian aparte.
    for (const id of ['#f-desde', '#f-hasta', '#f-actor', '#f-texto']) $(id).value = '';
    Object.assign(estado.filtros, {
      categoria: '', municipio: '', mes: '', desde: '', hasta: '', actor: '', texto: ''
    });
    marcarCategoriaActiva('');
    aplicarFiltros();
  });
}

function leerYAplicar() {
  Object.assign(estado.filtros, {
    categoria: $('#f-categoria').value,
    municipio: $('#f-municipio').value,
    mes: $('#f-mes').value,
    desde: $('#f-desde').value,
    hasta: $('#f-hasta').value,
    actor: $('#f-actor').value,
    texto: $('#f-texto').value
  });
  marcarCategoriaActiva(estado.filtros.categoria);
  aplicarFiltros();
}

function poblarSelectCategorias(select) {
  for (const [id, c] of estado.categorias) {
    const opcion = document.createElement('option');
    opcion.value = id;
    opcion.textContent = c.nombre;
    select.append(opcion);
  }
}

// Meses/años disponibles, derivados de las fechas de ocurrencia de
// los casos publicados (o su fecha de publicación si no la tienen).
function poblarSelectMeses(select) {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const claves = [...new Set(
    estado.casos
      .map((c) => (c.fecha_ocurrencia || (c.creado_en || '').slice(0, 10)).slice(0, 7))
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
  )].sort();
  for (const clave of claves) {
    const [anio, mes] = clave.split('-');
    const opcion = document.createElement('option');
    opcion.value = clave;
    opcion.textContent = `${MESES[Number(mes) - 1]} ${anio}`;
    select.append(opcion);
  }
}

function poblarSelectMunicipios(select) {
  for (const nombre of estado.municipios) {
    const opcion = document.createElement('option');
    opcion.value = nombre;
    opcion.textContent = nombre;
    select.append(opcion);
  }
}

// Lista de categorías con ícono + nombre + contador de casos
// aprobados entre corchetes. Clic = mismo efecto que elegirla en
// el desplegable de arriba y pulsar Filtrar.
function pintarPanelCategorias() {
  const lista = document.querySelector('#lista-categorias');
  lista.textContent = '';

  for (const [id, c] of estado.categorias) {
    const item = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'cat-item';
    boton.dataset.id = id;

    const icono = document.createElement('img');
    icono.src = `assets/icons/categorias/${c.icono}.svg`;
    icono.alt = '';
    icono.width = 22;
    icono.height = 22;
    icono.addEventListener('error', () => {
      icono.src = 'assets/icons/categorias/default.svg';
    }, { once: true });

    const punto = document.createElement('span');
    punto.className = 'cat-punto';
    punto.style.background = c.color_hex;

    const nombre = document.createElement('span');
    nombre.className = 'cat-nombre';
    nombre.textContent = c.nombre;

    const contador = document.createElement('span');
    contador.className = 'cat-contador';
    contador.textContent = `[${c.casos ?? 0}]`;

    boton.append(icono, punto, nombre, contador);
    boton.addEventListener('click', () => {
      // Segundo clic sobre la categoría activa la des-selecciona.
      const nueva = estado.filtros.categoria === id ? '' : id;
      estado.filtros.categoria = nueva;
      document.querySelector('#f-categoria').value = nueva;
      marcarCategoriaActiva(nueva);
      aplicarFiltros();
    });

    item.append(boton);
    lista.append(item);
  }
}

function marcarCategoriaActiva(id) {
  for (const boton of document.querySelectorAll('.cat-item')) {
    boton.classList.toggle('activo', boton.dataset.id === id && id !== '');
  }
}
