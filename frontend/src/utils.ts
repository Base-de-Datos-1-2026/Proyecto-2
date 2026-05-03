export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function headerLabel(value: string): string {
  const labels: Record<string, string> = {
    nombre_producto: 'Producto',
    grupo_kpop: 'Grupo',
    nombre_categoria: 'Categoría',
    nombre_proveedor: 'Proveedor',
    precio: 'Precio',
    precio_unitario: 'Precio unitario',
    fecha_compra: 'Fecha',
    metodo_pago: 'Método de pago',
    productos_distintos: 'Productos distintos',
    promedio_stock: 'Promedio de stock',
    nombre_rol: 'Rol',
  };

  return labels[value] ?? toTitleCase(value.replaceAll('_', ' '));
}

export function formatCell(value: unknown, column = ''): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return escapeHtml(new Date(value).toLocaleString('es-GT'));
  }
  if (['precio', 'precio_unitario', 'subtotal', 'total'].includes(column)) {
    const amount = Number(value);
    if (Number.isFinite(amount)) {
      return `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
  return escapeHtml(String(value));
}

export function qs<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`No existe ${selector}`);
  }

  return element;
}

export function qsa<T extends Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

export function option(id: number, label: string, selected?: number): string {
  return `<option value="${id}" ${selected === id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}
