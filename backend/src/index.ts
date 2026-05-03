import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import {
  authenticate,
  createSession,
  deleteSession,
  expiredSessionCookie,
  hashPassword,
  readSession,
  type SessionUser,
  sessionCookie,
} from './auth';
import { pool, query, withTransaction } from './db';
import { toCsv } from './csv';

type RouteSet = {
  status?: number | string;
  headers: Record<string, string | number>;
};

type SaleItem = {
  id_producto: number;
  cantidad: number;
};

const port = Number(process.env.BACKEND_PORT ?? 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

const app = new Elysia()
  .use(cors({
    origin: frontendOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }))
  .get('/api/health', async () => {
    await query('SELECT 1 AS ok');
    return { ok: true, service: 'KStore Galaxy API' };
  })
  .post('/api/auth/login', async ({ body, set }) => {
    const { correo, password } = body as { correo?: string; password?: string };

    if (!correo || !password) {
      return fail(set, 'Correo y password son obligatorios', 400);
    }

    const user = await authenticate(correo, password);
    if (!user) {
      return fail(set, 'Credenciales incorrectas', 401);
    }

    const token = createSession(user);
    set.headers['Set-Cookie'] = sessionCookie(token);
    return { user };
  })
  .get('/api/auth/me', ({ headers }) => {
    const { user } = readSession(headers.cookie);
    return { user };
  })
  .post('/api/auth/logout', ({ headers, set }) => {
    const { token } = readSession(headers.cookie);
    deleteSession(token);
    set.headers['Set-Cookie'] = expiredSessionCookie();
    return { message: 'Sesion cerrada' };
  })
  .get('/api/categories', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT id_categoria, nombre_categoria, descripcion
       FROM categoria
       ORDER BY id_categoria`,
    );
    return { data: result.rows };
  })
  .post('/api/categories', async ({ body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);

    const payload = body as { nombre_categoria?: string; descripcion?: string };
    const error = validateText(payload.nombre_categoria, 'Nombre') ?? validateText(payload.descripcion, 'Descripcion');
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `INSERT INTO categoria (nombre_categoria, descripcion)
         VALUES ($1, $2)
         RETURNING id_categoria, nombre_categoria, descripcion`,
        [payload.nombre_categoria?.trim(), payload.descripcion?.trim()],
      );
      return { data: result.rows[0], message: 'Categoria creada' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .put('/api/categories/:id', async ({ params, body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);

    const id = Number(params.id);
    const payload = body as { nombre_categoria?: string; descripcion?: string };
    const error = validateId(id) ?? validateText(payload.nombre_categoria, 'Nombre') ?? validateText(payload.descripcion, 'Descripcion');
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `UPDATE categoria
         SET nombre_categoria = $1,
             descripcion = $2
         WHERE id_categoria = $3
         RETURNING id_categoria, nombre_categoria, descripcion`,
        [payload.nombre_categoria?.trim(), payload.descripcion?.trim(), id],
      );

      if (result.rowCount === 0) return fail(set, 'Categoria no encontrada', 404);
      return { data: result.rows[0], message: 'Categoria actualizada' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .delete('/api/categories/:id', async ({ params, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);

    const id = Number(params.id);
    const error = validateId(id);
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `DELETE FROM categoria
         WHERE id_categoria = $1`,
        [id],
      );

      if (result.rowCount === 0) return fail(set, 'Categoria no encontrada', 404);
      return { message: 'Categoria eliminada' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .get('/api/products', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          p.id_producto,
          p.nombre_producto,
          p.id_categoria,
          c.nombre_categoria,
          p.id_proveedor,
          pr.nombre_proveedor,
          p.grupo_kpop,
          p.precio,
          p.stock,
          p.descripcion
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       JOIN proveedor pr ON pr.id_proveedor = p.id_proveedor
       ORDER BY p.id_producto`,
    );
    return { data: result.rows };
  })
  .post('/api/products', async ({ body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);

    const payload = body as Record<string, unknown>;
    const error = validateProduct(payload);
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `INSERT INTO producto (
            nombre_producto, id_categoria, id_proveedor, grupo_kpop, precio, stock, descripcion
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_producto`,
        [
          String(payload.nombre_producto).trim(),
          Number(payload.id_categoria),
          Number(payload.id_proveedor),
          String(payload.grupo_kpop).trim(),
          Number(payload.precio),
          Number(payload.stock),
          String(payload.descripcion).trim(),
        ],
      );

      return { data: result.rows[0], message: 'Producto creado' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .put('/api/products/:id', async ({ params, body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);

    const id = Number(params.id);
    const payload = body as Record<string, unknown>;
    const error = validateId(id) ?? validateProduct(payload);
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `UPDATE producto
         SET nombre_producto = $1,
             id_categoria = $2,
             id_proveedor = $3,
             grupo_kpop = $4,
             precio = $5,
             stock = $6,
             descripcion = $7
         WHERE id_producto = $8
         RETURNING id_producto`,
        [
          String(payload.nombre_producto).trim(),
          Number(payload.id_categoria),
          Number(payload.id_proveedor),
          String(payload.grupo_kpop).trim(),
          Number(payload.precio),
          Number(payload.stock),
          String(payload.descripcion).trim(),
          id,
        ],
      );

      if (result.rowCount === 0) return fail(set, 'Producto no encontrado', 404);
      return { data: result.rows[0], message: 'Producto actualizado' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .delete('/api/products/:id', async ({ params, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);

    const id = Number(params.id);
    const error = validateId(id);
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `DELETE FROM producto
         WHERE id_producto = $1`,
        [id],
      );

      if (result.rowCount === 0) return fail(set, 'Producto no encontrado', 404);
      return { message: 'Producto eliminado' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .get('/api/providers', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT id_proveedor, nombre_proveedor, correo, numero
       FROM proveedor
       ORDER BY id_proveedor`,
    );
    return { data: result.rows };
  })
  .post('/api/providers', async ({ body, headers, set }) => {
    const user = ensureHighRole(headers.cookie, set);
    if (!user) return accessError(set);

    const payload = body as { nombre_proveedor?: string; correo?: string; numero?: string };
    const error =
      validateText(payload.nombre_proveedor, 'Nombre del proveedor') ??
      validateEmail(payload.correo) ??
      validateText(payload.numero, 'Telefono');
    if (error) return fail(set, error, 400);

    try {
      const result = await query(
        `INSERT INTO proveedor (nombre_proveedor, correo, numero)
         VALUES ($1, $2, $3)
         RETURNING id_proveedor, nombre_proveedor, correo, numero`,
        [payload.nombre_proveedor?.trim(), payload.correo?.trim().toLowerCase(), payload.numero?.trim()],
      );
      return { data: result.rows[0], message: 'Proveedor agregado' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .get('/api/customers', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT u.id_usuario, u.nombre, u.correo, cn.nit
       FROM usuario u
       LEFT JOIN cliente_nit cn ON cn.id_cliente = u.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol
       WHERE r.nombre_rol = 'Cliente'
       ORDER BY u.id_usuario`,
    );
    return { data: result.rows };
  })
  .post('/api/customers', async ({ body, headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const payload = body as { nombre?: string; correo?: string; numero?: string; nit?: string };
    const error =
      validateText(payload.nombre, 'Nombre del cliente') ??
      validateEmail(payload.correo) ??
      validateText(payload.numero, 'Telefono');
    if (error) return fail(set, error, 400);

    try {
      const customer = await withTransaction(async (client) => {
        const userResult = await client.query<{ id_usuario: number }>(
          `INSERT INTO usuario (id_rol, nombre, correo, numero, activo)
           VALUES (3, $1, $2, $3, TRUE)
           RETURNING id_usuario`,
          [
            payload.nombre?.trim(),
            payload.correo?.trim().toLowerCase(),
            payload.numero?.trim(),
          ],
        );

        const nit = payload.nit?.trim() || null;

        await client.query(
          `INSERT INTO cliente_nit (id_cliente, nit)
           VALUES ($1, $2)`,
          [userResult.rows[0].id_usuario, nit],
        );

        return userResult.rows[0];
      });

      return { data: customer, message: 'Cliente agregado' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .get('/api/employees', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT u.id_usuario, u.nombre, u.correo, r.nombre_rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       WHERE r.nombre_rol IN ('Administrador', 'Empleado de caja', 'Supervisor de tienda', 'Gerente')
       ORDER BY u.id_usuario`,
    );
    return { data: result.rows };
  })
  .post('/api/employees', async ({ body, headers, set }) => {
    const user = ensureHighRole(headers.cookie, set);
    if (!user) return accessError(set);

    const payload = body as { nombre?: string; correo?: string; numero?: string; password?: string; id_rol?: number };
    const error =
      validateText(payload.nombre, 'Nombre del empleado') ??
      validateEmail(payload.correo) ??
      validateText(payload.numero, 'Telefono') ??
      validatePassword(payload.password, 'Password') ??
      validateEmployeeRole(Number(payload.id_rol));
    if (error) return fail(set, error, 400);

    const employeeRole = Number(payload.id_rol);

    try {
      const result = await withTransaction(async (client) => {
        const userResult = await client.query<{ id_usuario: number; nombre: string; correo: string }>(
          `INSERT INTO usuario (id_rol, nombre, correo, numero, activo)
           VALUES ($4, $1, $2, $3, TRUE)
           RETURNING id_usuario, nombre, correo`,
          [
            payload.nombre?.trim(),
            payload.correo?.trim().toLowerCase(),
            payload.numero?.trim(),
            employeeRole,
          ],
        );

        const employeeId = userResult.rows[0].id_usuario;

        await client.query(
          `INSERT INTO empleado_contraseña (id_empleado, password_hash)
           VALUES ($1, $2)`,
          [employeeId, hashPassword(payload.password?.trim() ?? '')],
        );

        return userResult.rows[0];
      });
      return { data: result, message: 'Empleado agregado' };
    } catch (error) {
      return databaseError(set, error);
    }
  })
  .post('/api/sales', async ({ body, headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const payload = body as { id_cliente?: number; id_empleado?: number; metodo_pago?: string; items?: SaleItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    const error =
      validateId(Number(payload.id_cliente), 'Cliente') ??
      validateId(Number(payload.id_empleado), 'Empleado') ??
      validateText(payload.metodo_pago, 'Metodo de pago') ??
      validateSaleItems(items);

    if (error) return fail(set, error, 400);

    try {
      const sale = await withTransaction(async (client) => {
        const header = await client.query<{ id_compra: number }>(
          `INSERT INTO compra (id_cliente, id_empleado, fecha_compra, metodo_pago, estado)
           VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'pagada')
           RETURNING id_compra`,
          [Number(payload.id_cliente), Number(payload.id_empleado), String(payload.metodo_pago).trim()],
        );

        const idCompra = header.rows[0].id_compra;

        for (const item of items) {
          const product = await client.query<{ id_producto: number; nombre_producto: string; precio: string; stock: number }>(
            `SELECT id_producto, nombre_producto, precio, stock
             FROM producto
             WHERE id_producto = $1
             FOR UPDATE`,
            [Number(item.id_producto)],
          );

          if (product.rowCount === 0) {
            throw new Error(`Producto ${item.id_producto} no existe`);
          }

          const current = product.rows[0];
          if (current.stock < Number(item.cantidad)) {
            throw new Error(`Stock insuficiente para ${current.nombre_producto}. Disponible: ${current.stock}`);
          }

          await client.query(
            `UPDATE producto
             SET stock = stock - $1
             WHERE id_producto = $2`,
            [Number(item.cantidad), Number(item.id_producto)],
          );

          await client.query(
            `INSERT INTO detalle_compra (id_compra, id_producto, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4)`,
            [idCompra, Number(item.id_producto), Number(item.cantidad), current.precio],
          );
        }

        return { id_compra: idCompra };
      });

      return { data: sale, message: 'Venta registrada con transaccion COMMIT' };
    } catch (error) {
      return fail(set, error instanceof Error ? `ROLLBACK: ${error.message}` : 'ROLLBACK: error en venta', 400);
    }
  })
  .get('/api/reports/join/sales-detail', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          p.nombre_producto,
          p.grupo_kpop,
          cat.nombre_categoria,
          SUM(dc.cantidad) AS unidades_vendidas,
          COUNT(DISTINCT dc.id_compra) AS compras,
          SUM(dc.cantidad * dc.precio_unitario) AS total
       FROM detalle_compra dc
       JOIN producto p ON p.id_producto = dc.id_producto
       JOIN categoria cat ON cat.id_categoria = p.id_categoria
       GROUP BY p.id_producto, p.nombre_producto, p.grupo_kpop, cat.nombre_categoria
       ORDER BY total DESC, unidades_vendidas DESC
       LIMIT 100`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/join/inventory', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          pr.nombre_proveedor,
          pr.correo,
          pr.numero,
          COUNT(p.id_producto) AS productos,
          SUM(p.stock) AS unidades_disponibles,
          SUM(p.stock * p.precio) AS valor_inventario,
          MIN(p.stock) AS stock_minimo,
          MAX(p.stock) AS stock_maximo
       FROM producto p
       JOIN proveedor pr ON pr.id_proveedor = p.id_proveedor
       GROUP BY pr.id_proveedor, pr.nombre_proveedor, pr.correo, pr.numero
       ORDER BY valor_inventario DESC`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/join/customer-purchases', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          c.id_compra,
          cliente.nombre AS cliente,
          cn.nit,
          empleado.nombre AS empleado,
          c.fecha_compra,
          SUM(dc.cantidad * dc.precio_unitario) AS total
       FROM compra c
       JOIN usuario cliente ON cliente.id_usuario = c.id_cliente
       LEFT JOIN cliente_nit cn ON cn.id_cliente = cliente.id_usuario
       JOIN usuario empleado ON empleado.id_usuario = c.id_empleado
       JOIN detalle_compra dc ON dc.id_compra = c.id_compra
       GROUP BY c.id_compra, cliente.nombre, cn.nit, empleado.nombre, c.fecha_compra
       ORDER BY c.fecha_compra DESC
       LIMIT 50`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/subquery/low-stock', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          p.id_producto,
          p.nombre_producto,
          p.grupo_kpop,
          p.stock,
          ROUND((SELECT AVG(stock) FROM producto), 2) AS promedio_stock
       FROM producto p
       WHERE p.stock < (SELECT AVG(stock) FROM producto)
       ORDER BY p.stock ASC`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/subquery/frequent-customers', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          u.id_usuario,
          u.nombre,
          u.correo,
          cn.nit,
          COUNT(c.id_compra) AS compras
       FROM usuario u
       LEFT JOIN cliente_nit cn ON cn.id_cliente = u.id_usuario
       JOIN compra c ON c.id_cliente = u.id_usuario
       GROUP BY u.id_usuario, u.nombre, u.correo, cn.nit
       HAVING COUNT(c.id_compra) >= 2
       ORDER BY compras DESC, u.nombre`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/aggregate/category-sales', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT
          cat.nombre_categoria,
          COUNT(DISTINCT c.id_compra) AS compras,
          SUM(dc.cantidad) AS unidades,
          SUM(dc.cantidad * dc.precio_unitario) AS total
       FROM categoria cat
       JOIN producto p ON p.id_categoria = cat.id_categoria
       JOIN detalle_compra dc ON dc.id_producto = p.id_producto
       JOIN compra c ON c.id_compra = dc.id_compra
       GROUP BY cat.id_categoria, cat.nombre_categoria
       HAVING SUM(dc.cantidad * dc.precio_unitario) > 100
       ORDER BY total DESC`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/sales-summary', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query(
      `SELECT id_compra, fecha_compra, cliente, empleado, metodo_pago, estado,
              productos_distintos, unidades, total
       FROM vista_resumen_ventas
       ORDER BY fecha_compra DESC, id_compra DESC
       LIMIT 100`,
    );
    return { data: result.rows };
  })
  .get('/api/reports/sales-summary.csv', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();

    const result = await query<Record<string, unknown>>(
      `SELECT
          TO_CHAR(fecha_compra, 'YYYY-MM-DD HH24:MI') AS "Fecha",
          cliente AS "Cliente",
          empleado AS "Empleado",
          metodo_pago AS "Metodo de pago",
          estado AS "Estado",
          productos_distintos AS "Productos",
          unidades AS "Unidades",
          'Q ' || TO_CHAR(total, 'FM999G999G990D00') AS "Total"
       FROM vista_resumen_ventas
       ORDER BY fecha_compra DESC, id_compra DESC
       LIMIT 100`,
    );

    set.headers['Content-Type'] = 'text/csv; charset=utf-8';
    set.headers['Content-Disposition'] = 'attachment; filename="kstore_galaxy_resumen_ventas.csv"';
    return `\uFEFF${toCsv(result.rows)}`;
  })
  .onError(({ error, set }) => {
    console.error(error);
    return fail(set, 'Error interno del servidor', 500);
  });

app.listen(port);
console.log(`KStore Galaxy API escuchando en http://localhost:${port}`);

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

function ensureAuth(cookieHeader: string | undefined, set: RouteSet): boolean {
  const user = getAuthenticatedUser(cookieHeader, set);
  return Boolean(user);
}

function getAuthenticatedUser(cookieHeader: string | undefined, set: RouteSet): SessionUser | null {
  const { user } = readSession(cookieHeader);
  if (!user) {
    fail(set, 'Debe iniciar sesion', 401);
    return null;
  }

  return user;
}

function ensureHighRole(cookieHeader: string | undefined, set: RouteSet): SessionUser | null {
  const user = getAuthenticatedUser(cookieHeader, set);
  if (!user) {
    return null;
  }

  if (!['Administrador', 'Supervisor de tienda', 'Gerente'].includes(user.nombre_rol)) {
    fail(set, 'Solo administradores, supervisores o gerentes pueden realizar esta accion', 403);
    return null;
  }

  return user;
}

function ensureAdmin(cookieHeader: string | undefined, set: RouteSet): SessionUser | null {
  const user = getAuthenticatedUser(cookieHeader, set);
  if (!user) {
    return null;
  }

  if (user.nombre_rol !== 'Administrador') {
    fail(set, 'Solo administradores pueden realizar esta accion', 403);
    return null;
  }

  return user;
}

function fail(set: RouteSet, message: string, status: number) {
  set.status = status;
  return { error: message };
}

function authError() {
  return { error: 'Debe iniciar sesion' };
}

function accessError(set: RouteSet) {
  return {
    error:
      set.status === 403
        ? 'No tiene permisos para realizar esta accion'
        : 'Debe iniciar sesion',
  };
}

function validateId(id: number, label = 'ID'): string | null {
  if (!Number.isInteger(id) || id <= 0) {
    return `${label} invalido`;
  }

  return null;
}

function validateText(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || value.trim().length < 2) {
    return `${label} debe tener al menos 2 caracteres`;
  }

  return null;
}

function validatePassword(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || value.trim().length < 6) {
    return `${label} debe tener al menos 6 caracteres`;
  }

  return null;
}

function validateEmployeeRole(idRol: number): string | null {
  if (!Number.isInteger(idRol) || idRol <= 0) {
    return 'Rol invalido';
  }

  if (![2, 4, 5].includes(idRol)) {
    return 'Solo se pueden asignar roles de empleado, supervisor o gerente';
  }

  return null;
}

function validateEmail(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return 'Correo invalido';
  }

  return null;
}

function validateProduct(payload: Record<string, unknown>): string | null {
  return (
    validateText(payload.nombre_producto, 'Nombre de producto') ??
    validateId(Number(payload.id_categoria), 'Categoria') ??
    validateId(Number(payload.id_proveedor), 'Proveedor') ??
    validateText(payload.grupo_kpop, 'Grupo K-pop') ??
    validateText(payload.descripcion, 'Descripcion') ??
    validateMoney(Number(payload.precio), 'Precio') ??
    validateStock(Number(payload.stock))
  );
}

function validateMoney(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return `${label} debe ser mayor o igual a 0`;
  }

  return null;
}

function validateStock(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) {
    return 'Stock debe ser un entero mayor o igual a 0';
  }

  return null;
}

function validateSaleItems(items: SaleItem[]): string | null {
  if (items.length === 0) {
    return 'La venta debe incluir al menos un producto';
  }

  const seen = new Set<number>();
  for (const item of items) {
    const productError = validateId(Number(item.id_producto), 'Producto');
    if (productError) return productError;

    if (seen.has(Number(item.id_producto))) {
      return 'No repita el mismo producto dentro de la venta';
    }
    seen.add(Number(item.id_producto));

    if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
      return 'Cantidad debe ser un entero mayor a 0';
    }
  }

  return null;
}

function databaseError(set: RouteSet, error: unknown) {
  const pgError = error as { code?: string; detail?: string; message?: string };

  if (pgError.code === '23505') {
    return fail(set, 'Ya existe un registro con un valor unico repetido', 409);
  }

  if (pgError.code === '23503') {
    return fail(set, 'No se puede eliminar o guardar: el registro esta relacionado con otros datos', 409);
  }

  if (pgError.code === '23514') {
    return fail(set, 'Los datos no cumplen una regla de validacion de la base de datos', 400);
  }

  console.error(error);
  return fail(set, pgError.message ?? 'Error de base de datos', 500);
}
