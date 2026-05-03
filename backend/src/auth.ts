import { createHash, randomUUID } from 'node:crypto';
import { query } from './db';

export type SessionUser = {
  id_usuario: number;
  id_rol: number;
  nombre_rol: string;
  nombre: string;
  correo: string;
};

const sessions = new Map<string, SessionUser>();

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function authenticate(correo: string, password: string): Promise<SessionUser | null> {
  const result = await query<SessionUser & { id_rol: number }>(
    `SELECT
        u.id_usuario,
        u.id_rol,
        r.nombre_rol,
        u.nombre,
        u.correo
     FROM usuario u
     JOIN rol r ON r.id_rol = u.id_rol
     WHERE u.correo = $1
       AND u.activo = TRUE`,
    [correo],
  );

  const user = result.rows[0];
  if (!user) {
    return null;
  }

  // Clientes (rol 3) no pueden autenticarse
  if (user.id_rol === 3) {
    return null;
  }

  // Verificar contraseña en tabla empleado_contraseña
  const passwordResult = await query<{ password_hash: string }>(
    `SELECT password_hash FROM empleado_contraseña WHERE id_empleado = $1`,
    [user.id_usuario],
  );

  const employeePassword = passwordResult.rows[0];
  if (!employeePassword || employeePassword.password_hash !== hashPassword(password)) {
    return null;
  }

  return {
    id_usuario: user.id_usuario,
    id_rol: user.id_rol,
    nombre_rol: user.nombre_rol,
    nombre: user.nombre,
    correo: user.correo,
  };
}

export function createSession(user: SessionUser): string {
  const token = randomUUID();
  sessions.set(token, user);
  return token;
}

export function deleteSession(token: string | null): void {
  if (token) {
    sessions.delete(token);
  }
}

export function readSession(cookieHeader: string | undefined): { token: string | null; user: SessionUser | null } {
  const token = parseCookie(cookieHeader).get('kpop_session') ?? null;
  return {
    token,
    user: token ? sessions.get(token) ?? null : null,
  };
}

export function sessionCookie(token: string): string {
  return `kpop_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;
}

export function expiredSessionCookie(): string {
  return 'kpop_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0';
}

function parseCookie(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) {
      continue;
    }

    cookies.set(rawKey, decodeURIComponent(rawValue.join('=')));
  }

  return cookies;
}
