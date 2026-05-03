export function personPayload(form: FormData, includeNit: boolean): Record<string, string> {
  const payload: Record<string, string> = {
    nombre: String(form.get('nombre') ?? ''),
    correo: String(form.get('correo') ?? ''),
    numero: String(form.get('numero') ?? ''),
  };

  // Solo incluir password para empleados (includeNit = false)
  if (!includeNit) {
    payload.password = String(form.get('password') ?? '');
  }

  if (includeNit) {
    const nit = String(form.get('nit') ?? '').trim();
    if (nit) {
      payload.nit = nit;
    }
  }

  const roleId = String(form.get('id_rol') ?? '').trim();
  if (roleId) {
    payload.id_rol = roleId;
  }

  return payload;
}
