// Panel de administración OJAM.
// Autenticación: Supabase Auth (email + contraseña). El token de la
// sesión viaja como Bearer al backend, que además verifica que el
// correo esté en la lista ADMIN_EMAIL.
//
// supabase-js se carga desde CDN solo aquí: el panel admin es una
// herramienta interna con conexión; la vista pública no lo paga.

import { CONFIG } from '../config.js';
import { crearSelectorPunto } from '../map.js';
import { avisar } from '../avisos.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (sel) => document.querySelector(sel);
const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let categorias = [];
let selectorWhatsapp = null;
const minimapasEdicion = new Map();

// --- API del backend con token de sesión -------------------------

async function tokenSesion() {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

async function pedirAdmin(ruta, opciones = {}) {
  const token = await tokenSesion();
  const respuesta = await fetch(`${CONFIG.API_URL}/api/admin${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opciones.headers || {})
    }
  });
  if (opciones.crudo) return respuesta;
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error || `Error ${respuesta.status}`);
  return cuerpo;
}

// --- Sesión ------------------------------------------------------

async function arrancar() {
  $('#form-ingreso').addEventListener('submit', ingresar);
  $('#btn-salir').addEventListener('click', () => sb.auth.signOut());
  sb.auth.onAuthStateChange((_evento, sesion) => pintarSesion(sesion));

  const { data } = await sb.auth.getSession();
  pintarSesion(data.session);
}

async function ingresar(evento) {
  evento.preventDefault();
  const msg = $('#ingreso-msg');
  msg.textContent = 'Verificando…';
  msg.className = 'form-msg';
  const { error } = await sb.auth.signInWithPassword({
    email: $('#in-correo').value.trim(),
    password: $('#in-clave').value
  });
  if (error) {
    msg.textContent = 'Credenciales inválidas o cuenta inexistente.';
    msg.className = 'form-msg error';
  }
}

function pintarSesion(sesion) {
  const conectado = Boolean(sesion);
  $('#vista-ingreso').hidden = conectado;
  $('#vista-admin').hidden = !conectado;
  $('#sesion').hidden = !conectado;
  if (conectado) {
    $('#sesion-correo').textContent = sesion.user.email;
    iniciarApp();
  }
}

let appIniciada = false;
async function iniciarApp() {
  if (appIniciada) return;
  appIniciada = true;

  for (const boton of document.querySelectorAll('.pestana')) {
    boton.addEventListener('click', () => abrirSeccion(boton.dataset.seccion));
  }

  $('#filtro-estado').addEventListener('change', cargarReportes);
  $('#form-whatsapp').addEventListener('submit', guardarWhatsapp);
  $('#w-anonimo').addEventListener('change', () => {
    $('#w-campo-contacto').hidden = $('#w-anonimo').checked;
    if ($('#w-anonimo').checked) $('#w-contacto').value = '';
  });
  $('#form-cat').addEventListener('submit', crearCategoria);
  for (const boton of document.querySelectorAll('[data-export]')) {
    boton.addEventListener('click', () => exportar(boton.dataset.export));
  }

  try {
    await cargarCategorias();
    await cargarMunicipios();
    await cargarPendientes();
  } catch (error) {
    avisar(error.message, 'error');
  }
}

function abrirSeccion(nombre) {
  for (const boton of document.querySelectorAll('.pestana')) {
    boton.classList.toggle('activa', boton.dataset.seccion === nombre);
  }
  for (const seccion of document.querySelectorAll('.seccion')) {
    seccion.hidden = seccion.id !== `seccion-${nombre}`;
  }
  if (nombre === 'pendientes') cargarPendientes().catch((e) => avisar(e.message, 'error'));
  if (nombre === 'reportes') cargarReportes().catch((e) => avisar(e.message, 'error'));
  if (nombre === 'categorias') pintarCategorias();
  if (nombre === 'whatsapp' && !selectorWhatsapp) {
    selectorWhatsapp = crearSelectorPunto('minimapa-whatsapp', (lat, lon) => {
      $('#w-lat').value = lat.toFixed(6);
      $('#w-lon').value = lon.toFixed(6);
    });
    setTimeout(() => selectorWhatsapp.invalidar(), 80);
  }
}

// --- Datos base --------------------------------------------------

async function cargarCategorias() {
  categorias = await pedirAdmin('/categorias');
  const select = $('#w-categoria');
  select.length = 1;
  for (const c of categorias) {
    const opcion = document.createElement('option');
    opcion.value = c.id;
    opcion.textContent = c.nombre;
    select.append(opcion);
  }
}

async function cargarMunicipios() {
  try {
    const geojson = await fetch(CONFIG.ARCHIVO_LIMITES).then((r) => r.json());
    const datalist = $('#lista-municipios');
    for (const nombre of geojson.features.map((f) => f.properties.nombre).sort()) {
      const opcion = document.createElement('option');
      opcion.value = nombre;
      datalist.append(opcion);
    }
  } catch {
    // Sin límites cargados el datalist queda vacío: el campo sigue siendo texto libre.
  }
}

function nombreCategoria(id) {
  return categorias.find((c) => c.id === id)?.nombre ?? '—';
}

// --- Cola de pendientes ------------------------------------------

async function cargarPendientes() {
  const pendientes = await pedirAdmin('/reportes?estado=pendiente');
  $('#cuenta-pendientes').textContent = pendientes.length || '';
  const lista = $('#lista-pendientes');
  lista.textContent = '';
  if (pendientes.length === 0) {
    lista.innerHTML = '<p class="panel-vacio">No hay reportes pendientes. 🎉</p>';
    return;
  }
  for (const r of pendientes) lista.append(fichaReporte(r, 'moderar'));
}

// --- Todos los reportes ------------------------------------------

async function cargarReportes() {
  const estado = $('#filtro-estado').value;
  const reportes = await pedirAdmin(`/reportes${estado ? `?estado=${estado}` : ''}`);
  const lista = $('#lista-reportes');
  lista.textContent = '';
  if (reportes.length === 0) {
    lista.innerHTML = '<p class="panel-vacio">Sin reportes para este filtro.</p>';
    return;
  }
  for (const r of reportes) lista.append(fichaReporte(r, 'completo'));
}

// --- Ficha de un reporte -----------------------------------------

function fichaReporte(r, modo) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha-admin';

  const cabecera = document.createElement('header');
  const titulo = document.createElement('h3');
  titulo.textContent = r.nombre_problematica;
  cabecera.append(titulo, insignia(r.estado), insignia(r.canal_origen));
  ficha.append(cabecera);

  const datos = document.createElement('dl');
  datos.className = 'ficha-datos';
  const contacto = r.es_anonimo
    ? 'Reporte anónimo (sin contacto, por decisión de quien reportó)'
    : r.contacto_reportante || 'No dejó contacto';
  const filas = [
    ['Municipio', r.municipio],
    ['Tipo', r.categoria ?? nombreCategoria(r.categoria_id)],
    ['Ocurrió', r.fecha_ocurrencia || '—'],
    ['Recibido', (r.creado_en || '').replace('T', ' ').slice(0, 16)],
    ['Actores', r.actores_involucrados || '—'],
    ['Coordenadas', `${Number(r.lat).toFixed(5)}, ${Number(r.lon).toFixed(5)}`],
    ['Contacto', contacto],
    ['Descripción', r.descripcion]
  ];
  for (const [termino, valor] of filas) {
    const dt = document.createElement('dt');
    dt.textContent = termino;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    if (termino === 'Contacto' && !r.es_anonimo && r.contacto_reportante) {
      dd.className = 'contacto-sensible';
    }
    datos.append(dt, dd);
  }
  ficha.append(datos);

  const acciones = document.createElement('div');
  acciones.className = 'ficha-acciones';

  const nota = document.createElement('input');
  nota.type = 'text';
  nota.placeholder = 'Nota para la auditoría (opcional)';
  nota.maxLength = 1000;

  if (modo === 'moderar') {
    acciones.append(
      nota,
      botonEstado(r, 'aprobado', 'Aprobar', 'btn btn-aprobar', nota),
      botonEstado(r, 'rechazado', 'Rechazar', 'btn btn-rechazar', nota)
    );
  } else {
    if (r.estado !== 'aprobado') {
      acciones.append(botonEstado(r, 'aprobado', 'Aprobar', 'btn btn-aprobar', nota));
    }
    if (r.estado !== 'rechazado') {
      acciones.append(botonEstado(r, 'rechazado', 'Rechazar', 'btn btn-rechazar', nota));
    }
    if (r.estado !== 'pendiente') {
      acciones.append(botonEstado(r, 'pendiente', 'Devolver a pendiente', 'btn btn-terciario', nota));
    }
    acciones.append(nota);

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'btn btn-secundario';
    btnEditar.textContent = 'Editar / mover pin';
    btnEditar.addEventListener('click', () => alternarEdicion(ficha, r));
    acciones.append(btnEditar);

    const btnAuditoria = document.createElement('button');
    btnAuditoria.type = 'button';
    btnAuditoria.className = 'btn btn-terciario';
    btnAuditoria.textContent = 'Auditoría';
    btnAuditoria.addEventListener('click', () => alternarAuditoria(ficha, r));
    acciones.append(btnAuditoria);
  }

  ficha.append(acciones);
  return ficha;
}

function insignia(texto) {
  const marca = document.createElement('span');
  marca.className = `insignia ${texto}`;
  marca.textContent = texto;
  return marca;
}

function botonEstado(r, estado, etiqueta, clase, inputNota) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = clase;
  boton.textContent = etiqueta;
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    try {
      await pedirAdmin(`/reportes/${r.id}/estado`, {
        method: 'POST',
        body: JSON.stringify({ estado, nota: inputNota.value })
      });
      avisar(`Reporte ${estado}.`, 'exito');
      await cargarPendientes();
      if (!$('#seccion-reportes').hidden) await cargarReportes();
    } catch (error) {
      avisar(error.message, 'error');
      boton.disabled = false;
    }
  });
  return boton;
}

// --- Edición (corregir textos y ubicación) -----------------------

function alternarEdicion(ficha, r) {
  const existente = ficha.querySelector('.zona-edicion');
  if (existente) {
    existente.remove();
    return;
  }

  const zona = document.createElement('div');
  zona.className = 'zona-edicion form-admin';

  const campos = [
    ['nombre_problematica', 'Nombre', 'text', r.nombre_problematica],
    ['municipio', 'Municipio', 'text', r.municipio],
    ['fecha_ocurrencia', 'Fecha de ocurrencia', 'date', r.fecha_ocurrencia || ''],
    ['actores_involucrados', 'Actores', 'text', r.actores_involucrados || '']
  ];
  const entradas = {};
  for (const [campo, etiqueta, tipo, valor] of campos) {
    const label = document.createElement('label');
    label.className = 'campo';
    const span = document.createElement('span');
    span.textContent = etiqueta;
    const input = document.createElement('input');
    input.type = tipo;
    input.value = valor;
    entradas[campo] = input;
    label.append(span, input);
    zona.append(label);
  }

  const labelCat = document.createElement('label');
  labelCat.className = 'campo';
  labelCat.innerHTML = '<span>Tipo de injusticia</span>';
  const selectCat = document.createElement('select');
  for (const c of categorias) {
    const opcion = document.createElement('option');
    opcion.value = c.id;
    opcion.textContent = c.nombre;
    opcion.selected = c.id === r.categoria_id;
    selectCat.append(opcion);
  }
  labelCat.append(selectCat);
  zona.append(labelCat);

  const labelDesc = document.createElement('label');
  labelDesc.className = 'campo';
  labelDesc.innerHTML = '<span>Descripción</span>';
  const areaDesc = document.createElement('textarea');
  areaDesc.rows = 5;
  areaDesc.value = r.descripcion;
  labelDesc.append(areaDesc);
  zona.append(labelDesc);

  // Minimapa para mover el pin
  const idMini = `mini-${r.id}`;
  const divMini = document.createElement('div');
  divMini.id = idMini;
  divMini.className = 'minimapa';
  zona.append(divMini);

  const coordenadas = document.createElement('div');
  coordenadas.className = 'coordenadas';
  const inputLat = document.createElement('input');
  inputLat.type = 'number';
  inputLat.step = 'any';
  inputLat.value = r.lat;
  const inputLon = document.createElement('input');
  inputLon.type = 'number';
  inputLon.step = 'any';
  inputLon.value = r.lon;
  const labelLat = document.createElement('label');
  labelLat.innerHTML = '<span>Latitud</span>';
  labelLat.append(inputLat);
  const labelLon = document.createElement('label');
  labelLon.innerHTML = '<span>Longitud</span>';
  labelLon.append(inputLon);
  coordenadas.append(labelLat, labelLon);
  zona.append(coordenadas);

  const guardar = document.createElement('button');
  guardar.type = 'button';
  guardar.className = 'btn btn-primario';
  guardar.textContent = 'Guardar cambios';
  guardar.addEventListener('click', async () => {
    guardar.disabled = true;
    try {
      await pedirAdmin(`/reportes/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre_problematica: entradas.nombre_problematica.value,
          municipio: entradas.municipio.value,
          fecha_ocurrencia: entradas.fecha_ocurrencia.value || null,
          actores_involucrados: entradas.actores_involucrados.value,
          categoria_id: selectCat.value,
          descripcion: areaDesc.value,
          lat: Number(inputLat.value),
          lon: Number(inputLon.value)
        })
      });
      avisar('Cambios guardados.', 'exito');
      await cargarReportes();
    } catch (error) {
      avisar(error.message, 'error');
      guardar.disabled = false;
    }
  });
  zona.append(guardar);

  ficha.append(zona);

  const selector = crearSelectorPunto(idMini, (lat, lon) => {
    inputLat.value = lat.toFixed(6);
    inputLon.value = lon.toFixed(6);
  });
  selector.fijar(Number(r.lat), Number(r.lon), true);
  selector.invalidar();
  minimapasEdicion.set(r.id, selector);
}

// --- Auditoría ---------------------------------------------------

async function alternarAuditoria(ficha, r) {
  const existente = ficha.querySelector('.auditoria');
  if (existente) {
    existente.remove();
    return;
  }
  const historial = await pedirAdmin(`/reportes/${r.id}/auditoria`);
  const lista = document.createElement('ul');
  lista.className = 'auditoria';
  for (const evento of historial) {
    const item = document.createElement('li');
    const fecha = document.createElement('span');
    fecha.className = 'fecha';
    fecha.textContent = (evento.fecha_cambio || '').replace('T', ' ').slice(0, 16) + ' — ';
    const texto = document.createElement('span');
    texto.textContent = evento.estado_anterior
      ? `${evento.estado_anterior} → ${evento.estado_nuevo}`
      : `creado (${evento.estado_nuevo})`;
    item.append(fecha, texto);
    if (evento.usuario_admin) {
      item.append(document.createTextNode(` · admin ${evento.usuario_admin.slice(0, 8)}…`));
    }
    if (evento.nota) {
      const nota = document.createElement('em');
      nota.textContent = ` — “${evento.nota}”`;
      item.append(nota);
    }
    lista.append(item);
  }
  ficha.append(lista);
}

// --- Carga manual desde WhatsApp ---------------------------------

async function guardarWhatsapp(evento) {
  evento.preventDefault();
  const msg = $('#whatsapp-msg');
  const esAnonimo = $('#w-anonimo').checked;
  const datos = {
    nombre_problematica: $('#w-nombre').value.trim(),
    municipio: $('#w-municipio').value.trim(),
    lat: Number($('#w-lat').value),
    lon: Number($('#w-lon').value),
    descripcion: $('#w-descripcion').value.trim(),
    fecha_ocurrencia: $('#w-fecha').value || null,
    actores_involucrados: $('#w-actores').value.trim() || null,
    categoria_id: $('#w-categoria').value,
    es_anonimo: esAnonimo,
    contacto_reportante: esAnonimo ? null : $('#w-contacto').value.trim() || null
  };
  try {
    await pedirAdmin('/reportes', { method: 'POST', body: JSON.stringify(datos) });
    $('#form-whatsapp').reset();
    $('#w-campo-contacto').hidden = false;
    msg.textContent = 'Reporte guardado en la cola de pendientes con canal «whatsapp».';
    msg.className = 'form-msg exito';
    cargarPendientes();
  } catch (error) {
    msg.textContent = error.message;
    msg.className = 'form-msg error';
  }
}

// --- Categorías --------------------------------------------------

function pintarCategorias() {
  const lista = $('#lista-cats');
  lista.textContent = '';
  for (const c of categorias) {
    const fila = document.createElement('div');
    fila.className = 'fila-cat';

    const nombre = document.createElement('input');
    nombre.type = 'text';
    nombre.value = c.nombre;
    nombre.maxLength = 80;
    nombre.setAttribute('aria-label', 'Nombre de la categoría');

    const color = document.createElement('input');
    color.type = 'color';
    color.value = c.color_hex;
    color.setAttribute('aria-label', 'Color');

    const icono = document.createElement('input');
    icono.type = 'text';
    icono.value = c.icono;
    icono.maxLength = 40;
    icono.setAttribute('aria-label', 'Ícono');

    const orden = document.createElement('input');
    orden.type = 'number';
    orden.value = c.orden;
    orden.setAttribute('aria-label', 'Orden');

    const casos = document.createElement('span');
    casos.className = 'cat-casos';
    casos.textContent = `${c.casos} caso(s)`;

    const guardar = document.createElement('button');
    guardar.type = 'button';
    guardar.className = 'btn btn-secundario';
    guardar.textContent = 'Guardar';
    guardar.addEventListener('click', async () => {
      try {
        await pedirAdmin(`/categorias/${c.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nombre: nombre.value,
            color_hex: color.value,
            icono: icono.value,
            orden: Number(orden.value)
          })
        });
        avisar('Categoría actualizada.', 'exito');
        await cargarCategorias();
        pintarCategorias();
      } catch (error) {
        avisar(error.message, 'error');
      }
    });

    const eliminar = document.createElement('button');
    eliminar.type = 'button';
    eliminar.className = 'btn btn-rechazar';
    eliminar.textContent = 'Eliminar';
    eliminar.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar la categoría «${c.nombre}»? Solo es posible si ningún reporte la usa.`)) return;
      try {
        await pedirAdmin(`/categorias/${c.id}`, { method: 'DELETE' });
        avisar('Categoría eliminada.', 'exito');
        await cargarCategorias();
        pintarCategorias();
      } catch (error) {
        avisar(error.message, 'error');
      }
    });

    const grupoBotones = document.createElement('span');
    grupoBotones.append(guardar, ' ', eliminar);
    fila.append(nombre, color, icono, orden, casos, grupoBotones);
    lista.append(fila);
  }
}

async function crearCategoria(evento) {
  evento.preventDefault();
  const msg = $('#cats-msg');
  try {
    await pedirAdmin('/categorias', {
      method: 'POST',
      body: JSON.stringify({
        nombre: $('#c-nombre').value.trim(),
        color_hex: $('#c-color').value,
        icono: $('#c-icono').value.trim() || 'default',
        orden: Number($('#c-orden').value) || 100
      })
    });
    $('#form-cat').reset();
    msg.textContent = 'Categoría creada.';
    msg.className = 'form-msg exito';
    await cargarCategorias();
    pintarCategorias();
  } catch (error) {
    msg.textContent = error.message;
    msg.className = 'form-msg error';
  }
}

// --- Exportación institucional -----------------------------------

const EXPORTS = {
  'reportes-csv': ['/export?formato=csv', 'ojam-completo.csv'],
  'reportes-geojson': ['/export?formato=geojson', 'ojam-completo.geojson'],
  'auditoria-csv': ['/export?tabla=auditoria', 'ojam-auditoria.csv']
};

async function exportar(tipo) {
  const [ruta, nombre] = EXPORTS[tipo];
  const msg = $('#export-msg');
  msg.textContent = 'Generando exportación…';
  msg.className = 'form-msg';
  try {
    const respuesta = await pedirAdmin(ruta, { crudo: true });
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
    msg.textContent = 'Descarga lista.';
    msg.className = 'form-msg exito';
  } catch (error) {
    msg.textContent = error.message;
    msg.className = 'form-msg error';
  }
}

arrancar();
