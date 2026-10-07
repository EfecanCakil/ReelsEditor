// Pencere genelinde sürükleme; onMove(dx, dy) piksel cinsinden
export function drag(e, onMove, onEnd) {
  const sx = e.clientX;
  const sy = e.clientY;
  const move = (ev) => onMove(ev.clientX - sx, ev.clientY - sy, ev);
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onEnd?.(ev.clientX - sx, ev.clientY - sy, ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
