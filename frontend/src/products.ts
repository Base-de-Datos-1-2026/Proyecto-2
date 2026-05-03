export function productPayload(form: FormData): Record<string, string | number> {
  return {
    nombre_producto: String(form.get('nombre_producto') ?? ''),
    id_categoria: Number(form.get('id_categoria')),
    id_proveedor: Number(form.get('id_proveedor')),
    grupo_kpop: String(form.get('grupo_kpop') ?? ''),
    precio: Number(form.get('precio')),
    stock: Number(form.get('stock')),
    descripcion: String(form.get('descripcion') ?? ''),
  };
}
