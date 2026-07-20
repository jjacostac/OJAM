// Formulario público "Agregar tu injusticia". Es una subvista de la
// misma página (cambio de URL con la history API): el mapa principal
// queda montado y no vuelve a pedir teselas al regresar.
//
// Resiliencia: si el envío falla por falta de señal, el reporte se
// guarda en IndexedDB y se reenvía automáticamente cuando vuelva la
// conexión (ver offline-queue.js), avisando a la persona.

import { estado } from './estado.js';
import { api } from './api.js';
import { crearSelectorPunto } from './map.js';
import { encolar } from './offline-queue.js';
import { avisar } from './avisos.js';

const $ = (sel) => document.querySelector(sel);
let selectorPunto = null;

export function initFormulario() {
  poblarSelects();

  // Anonimato: si se marca, el contacto se oculta y NO se envía.
  const anonimo = $('#r-anonimo');
  anonimo.addEventListener('change', () => {
    const campo = $('#campo-contacto');
    campo.hidden = anonimo.checked;
    if (anonimo.checked) $('#r-contacto').value = '';
  });

  // GPS del dispositivo, con ajuste manual si falla o es impreciso.
  $('#btn-gps').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      avisar('Este dispositivo no expone ubicación GPS. Marca el punto en el minimapa.', 'error');
      return;
    }
    $('#btn-gps').disabled = true;
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        $('#btn-gps').disabled = false;
        fijarPunto(posicion.coords.latitude, posicion.coords.longitude, true);
        avisar('Ubicación capturada. Puedes ajustar el pin arrastrándolo.', 'exito');
      },
      () => {
        $('#btn-gps').disabled = false;
        avisar('No se pudo obtener el GPS. Marca el punto directamente en el minimapa.', 'error');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  // Coordenadas manuales ⇄ pin del minimapa.
  for (const id of ['#r-lat', '#r-lon']) {
    $(id).addEventListener('change', () => {
      const lat = Number($('#r-lat').value);
      const lon = Number($('#r-lon').value);
      if (Number.isFinite(lat) && Number.isFinite(lon)) fijarPunto(lat, lon, true);
    });
  }

  $('#form-reporte').addEventListener('submit', enviar);
}

// El minimapa se crea la primera vez que se abre la subvista (lazy:
// no gasta datos de quien solo consulta el mapa).
export function alAbrirFormulario() {
  if (!selectorPunto) {
    selectorPunto = crearSelectorPunto('minimapa', (lat, lon) => {
      $('#r-lat').value = lat.toFixed(6);
      $('#r-lon').value = lon.toFixed(6);
    });
  }
  selectorPunto.invalidar();
  $('#titulo-formulario').focus();
}

function fijarPunto(lat, lon, centrar) {
  if (selectorPunto) selectorPunto.fijar(lat, lon, centrar);
}

function poblarSelects() {
  const selectMunicipio = $('#r-municipio');
  for (const nombre of estado.municipios) {
    const opcion = document.createElement('option');
    opcion.value = nombre;
    opcion.textContent = nombre;
    selectMunicipio.append(opcion);
  }
  const selectCategoria = $('#r-categoria');
  for (const [id, c] of estado.categorias) {
    const opcion = document.createElement('option');
    opcion.value = id;
    opcion.textContent = c.nombre;
    selectCategoria.append(opcion);
  }
}

function leerFormulario() {
  const esAnonimo = $('#r-anonimo').checked;
  return {
    nombre_problematica: $('#r-nombre').value.trim(),
    municipio: $('#r-municipio').value,
    lat: Number($('#r-lat').value),
    lon: Number($('#r-lon').value),
    descripcion: $('#r-descripcion').value.trim(),
    fecha_ocurrencia: $('#r-fecha').value || null,
    actores_involucrados: $('#r-actores').value.trim() || null,
    categoria_id: $('#r-categoria').value,
    es_anonimo: esAnonimo,
    contacto_reportante: esAnonimo ? null : $('#r-contacto').value.trim() || null
    // La fecha de carga (creado_en) la registra la base de datos al
    // recibir el envío: no se pide ni se puede manipular aquí.
  };
}

function validar(datos) {
  if (!datos.nombre_problematica) return 'Escribe el nombre de la problemática.';
  if (!datos.municipio) return 'Selecciona el municipio.';
  if (!Number.isFinite(datos.lat) || !Number.isFinite(datos.lon)) {
    return 'Falta la ubicación: usa el GPS o marca el punto en el minimapa.';
  }
  if (!datos.descripcion) return 'Describe la problemática.';
  if (!datos.categoria_id) return 'Selecciona el tipo de injusticia.';
  return null;
}

async function enviar(evento) {
  evento.preventDefault();
  const datos = leerFormulario();
  const error = validar(datos);
  const mensaje = $('#form-msg');

  if (error) {
    mensaje.textContent = error;
    mensaje.className = 'form-msg error';
    return;
  }

  const boton = $('#btn-enviar');
  boton.disabled = true;
  mensaje.textContent = 'Enviando…';
  mensaje.className = 'form-msg';

  try {
    await api.crearReporte(datos);
    $('#form-reporte').reset();
    $('#campo-contacto').hidden = false;
    mensaje.textContent =
      'Tu reporte fue recibido y quedó en cola de revisión. Cuando el equipo ' +
      'de curaduría lo apruebe, aparecerá publicado en el mapa.';
    mensaje.className = 'form-msg exito';
  } catch (fallo) {
    if (fallo.estado >= 400 && fallo.estado < 500) {
      // El servidor lo rechazó (validación o límite de envíos).
      mensaje.textContent = fallo.message;
      mensaje.className = 'form-msg error';
    } else {
      // Sin señal o servidor caído: a la cola local y a esperar red.
      await encolar(datos);
      $('#form-reporte').reset();
      $('#campo-contacto').hidden = false;
      mensaje.textContent =
        'No hay conexión en este momento. Tu reporte quedó guardado en este ' +
        'dispositivo y se enviará automáticamente cuando vuelva la señal.';
      mensaje.className = 'form-msg pendiente';
    }
  } finally {
    boton.disabled = false;
    mensaje.focus?.();
  }
}
