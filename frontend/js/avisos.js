// Avisos no intrusivos (toasts) con región aria-live para lectores
// de pantalla.

export function avisar(texto, tipo = 'info', duracionMs = 5000) {
  const contenedor = document.querySelector('#avisos');
  const aviso = document.createElement('p');
  aviso.className = `aviso ${tipo}`;
  aviso.textContent = texto;
  contenedor.append(aviso);
  setTimeout(() => {
    aviso.classList.add('saliendo');
    setTimeout(() => aviso.remove(), 400);
  }, duracionMs);
}
