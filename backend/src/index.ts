import { Elysia, t } from 'elysia';
import { cors } from '@elysia/cors';
import { openapi } from '@elysia/openapi';
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

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteSet = {
  status?: number | string;
  headers: Record<string, string | number>;
};

type SaleItem = {
  id_producto: number;
  cantidad: number;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const port = Number(process.env.BACKEND_PORT ?? 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

// ─── Shared schemas ───────────────────────────────────────────────────────────

const IdParam = t.Object({ id: t.Numeric() });

const CategoryBody = t.Object({
  nombre_categoria: t.String({ minLength: 2 }),
  descripcion: t.String({ minLength: 2 }),
});

const ProductBody = t.Object({
  nombre_producto: t.String({ minLength: 2 }),
  id_categoria: t.Numeric(),
  id_proveedor: t.Numeric(),
  grupo_kpop: t.String({ minLength: 2 }),
  precio: t.Number({ minimum: 0 }),
  stock: t.Integer({ minimum: 0 }),
  descripcion: t.String({ minLength: 2 }),
});

const CustomerBody = t.Object({
  nombre: t.String({ minLength: 2 }),
  correo: t.String({ format: 'email' }),
  numero: t.String({ minLength: 2 }),
  nit: t.Optional(t.String()),
});

const EmployeeBody = t.Object({
  nombre: t.String({ minLength: 2 }),
  correo: t.String({ format: 'email' }),
  numero: t.String({ minLength: 2 }),
  password: t.String({ minLength: 6 }),
  id_rol: t.Numeric(),
});

const ProviderBody = t.Object({
  nombre_proveedor: t.String({ minLength: 2 }),
  correo: t.String({ format: 'email' }),
  numero: t.String({ minLength: 2 }),
});

const LoginBody = t.Object({
  correo: t.String({ format: 'email' }),
  password: t.String({ minLength: 1 }),
});

const SaleItemSchema = t.Object({
  id_producto: t.Numeric(),
  cantidad: t.Integer({ minimum: 1 }),
});

const SaleBody = t.Object({
  id_cliente: t.Numeric(),
  id_empleado: t.Numeric(),
  metodo_pago: t.String({ minLength: 2 }),
  items: t.Array(SaleItemSchema, { minItems: 1 }),
});

// ─── App ──────────────────────────────────────────────────────────────────────

export const app = new Elysia()
  .use(cors({
    origin: frontendOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }))
  .use(openapi())

  // ─── Health ────────────────────────────────────────────────────────────────

  .get('/api/health', async () => {
    await query('SELECT 1 AS ok');
    return { ok: true, service: 'KStore Galaxy API' };
  }, {
    detail: { summary: 'Health check', tags: ['System'] },
  })

  // ─── Auth ──────────────────────────────────────────────────────────────────

  .post('/api/auth/login', async ({ body, set }) => {
    const user = await authenticate(body.correo, body.password);
    if (!user) {
      return fail(set, 'Credenciales incorrectas', 401);
    }
    const token = createSession(user);
    set.headers['Set-Cookie'] = sessionCookie(token);
    return { user };
  }, {
    body: LoginBody,
    detail: { summary: 'Login', tags: ['Auth'] },
  })

  .get('/api/auth/me', ({ headers }) => {
    const { user } = readSession(headers.cookie);
    return { user };
  }, {
    detail: { summary: 'Get current session user', tags: ['Auth'] },
  })

  .post('/api/auth/logout', ({ headers, set }) => {
    const { token } = readSession(headers.cookie);
    deleteSession(token);
    set.headers['Set-Cookie'] = expiredSessionCookie();
    return { message: 'Sesion cerrada' };
  }, {
    detail: { summary: 'Logout', tags: ['Auth'] },
  })

  // ─── Categories ────────────────────────────────────────────────────────────

  .get('/api/categories', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT id_categoria, nombre_categoria, descripcion
       FROM categoria ORDER BY id_categoria`,
    );
    return { data: result.rows };
  }, {
    detail: { summary: 'List categories', tags: ['Categories'] },
  })

  .post('/api/categories', async ({ body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);
    try {
      const result = await query(
        `INSERT INTO categoria (nombre_categoria, descripcion)
         VALUES ($1, $2)
         RETURNING id_categoria, nombre_categoria, descripcion`,
        [body.nombre_categoria.trim(), body.descripcion.trim()],
      );
      return { data: result.rows[0], message: 'Categoria creada' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    body: CategoryBody,
    detail: { summary: 'Create category', tags: ['Categories'] },
  })

  .put('/api/categories/:id', async ({ params: { id }, body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);
    try {
      const result = await query(
        `UPDATE categoria
         SET nombre_categoria = $1, descripcion = $2
         WHERE id_categoria = $3
         RETURNING id_categoria, nombre_categoria, descripcion`,
        [body.nombre_categoria.trim(), body.descripcion.trim(), id],
      );
      if (result.rowCount === 0) return fail(set, 'Categoria no encontrada', 404);
      return { data: result.rows[0], message: 'Categoria actualizada' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    params: IdParam,
    body: CategoryBody,
    detail: { summary: 'Update category', tags: ['Categories'] },
  })

  .delete('/api/categories/:id', async ({ params: { id }, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);
    try {
      const result = await query(
        `DELETE FROM categoria WHERE id_categoria = $1`,
        [id],
      );
      if (result.rowCount === 0) return fail(set, 'Categoria no encontrada', 404);
      return { message: 'Categoria eliminada' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    params: IdParam,
    detail: { summary: 'Delete category', tags: ['Categories'] },
  })

  // ─── Products ──────────────────────────────────────────────────────────────

  .get('/api/products', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT p.id_producto, p.nombre_producto, p.id_categoria,
              c.nombre_categoria, p.id_proveedor, pr.nombre_proveedor,
              p.grupo_kpop, p.precio, p.stock, p.descripcion
       FROM producto p
       JOIN categoria c ON c.id_categoria = p.id_categoria
       JOIN proveedor pr ON pr.id_proveedor = p.id_proveedor
       ORDER BY p.id_producto`,
    );
    return { data: result.rows };
  }, {
    detail: { summary: 'List products', tags: ['Products'] },
  })

  .post('/api/products', async ({ body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);
    try {
      const result = await query(
        `INSERT INTO producto (nombre_producto, id_categoria, id_proveedor,
                               grupo_kpop, precio, stock, descripcion)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_producto`,
        [
          body.nombre_producto.trim(),
          body.id_categoria,
          body.id_proveedor,
          body.grupo_kpop.trim(),
          body.precio,
          body.stock,
          body.descripcion.trim(),
        ],
      );
      return { data: result.rows[0], message: 'Producto creado' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    body: ProductBody,
    detail: { summary: 'Create product', tags: ['Products'] },
  })

  .put('/api/products/:id', async ({ params: { id }, body, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);
    try {
      const result = await query(
        `UPDATE producto
         SET nombre_producto = $1, id_categoria = $2, id_proveedor = $3,
             grupo_kpop = $4, precio = $5, stock = $6, descripcion = $7
         WHERE id_producto = $8
         RETURNING id_producto`,
        [
          body.nombre_producto.trim(),
          body.id_categoria,
          body.id_proveedor,
          body.grupo_kpop.trim(),
          body.precio,
          body.stock,
          body.descripcion.trim(),
          id,
        ],
      );
      if (result.rowCount === 0) return fail(set, 'Producto no encontrado', 404);
      return { data: result.rows[0], message: 'Producto actualizado' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    params: IdParam,
    body: ProductBody,
    detail: { summary: 'Update product', tags: ['Products'] },
  })

  .delete('/api/products/:id', async ({ params: { id }, headers, set }) => {
    if (!ensureAdmin(headers.cookie, set)) return accessError(set);
    try {
      const result = await query(
        `DELETE FROM producto WHERE id_producto = $1`,
        [id],
      );
      if (result.rowCount === 0) return fail(set, 'Producto no encontrado', 404);
      return { message: 'Producto eliminado' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    params: IdParam,
    detail: { summary: 'Delete product', tags: ['Products'] },
  })

  // ─── Providers ─────────────────────────────────────────────────────────────

  .get('/api/providers', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT id_proveedor, nombre_proveedor, correo, numero
       FROM proveedor ORDER BY id_proveedor`,
    );
    return { data: result.rows };
  }, {
    detail: { summary: 'List providers', tags: ['Providers'] },
  })

  .post('/api/providers', async ({ body, headers, set }) => {
    const user = ensureHighRole(headers.cookie, set);
    if (!user) return accessError(set);
    try {
      const result = await query(
        `INSERT INTO proveedor (nombre_proveedor, correo, numero)
         VALUES ($1, $2, $3)
         RETURNING id_proveedor, nombre_proveedor, correo, numero`,
        [body.nombre_proveedor.trim(), body.correo.trim().toLowerCase(), body.numero.trim()],
      );
      return { data: result.rows[0], message: 'Proveedor agregado' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    body: ProviderBody,
    detail: { summary: 'Create provider', tags: ['Providers'] },
  })

  // ─── Customers ─────────────────────────────────────────────────────────────

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
  }, {
    detail: { summary: 'List customers', tags: ['Customers'] },
  })

  .post('/api/customers', async ({ body, headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    try {
      const customer = await withTransaction(async (client) => {
        const userResult = await client.query<{ id_usuario: number }>(
          `INSERT INTO usuario (id_rol, nombre, correo, numero, activo)
           VALUES (3, $1, $2, $3, TRUE)
           RETURNING id_usuario`,
          [body.nombre.trim(), body.correo.trim().toLowerCase(), body.numero.trim()],
        );
        const nit = body.nit?.trim() || null;
        await client.query(
          `INSERT INTO cliente_nit (id_cliente, nit) VALUES ($1, $2)`,
          [userResult.rows[0].id_usuario, nit],
        );
        return userResult.rows[0];
      });
      return { data: customer, message: 'Cliente agregado' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    body: CustomerBody,
    detail: { summary: 'Create customer', tags: ['Customers'] },
  })

  // ─── Employees ─────────────────────────────────────────────────────────────

  .get('/api/employees', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT u.id_usuario, u.nombre, u.correo, r.nombre_rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       WHERE r.nombre_rol IN ('Administrador','Empleado de caja','Supervisor de tienda','Gerente')
       ORDER BY u.id_usuario`,
    );
    return { data: result.rows };
  }, {
    detail: { summary: 'List employees', tags: ['Employees'] },
  })

  .post('/api/employees', async ({ body, headers, set }) => {
    const user = ensureHighRole(headers.cookie, set);
    if (!user) return accessError(set);

    if (![2, 4, 5].includes(Number(body.id_rol))) {
      return fail(set, 'Solo se pueden asignar roles de empleado, supervisor o gerente', 400);
    }

    try {
      const result = await withTransaction(async (client) => {
        const userResult = await client.query<{ id_usuario: number; nombre: string; correo: string }>(
          `INSERT INTO usuario (id_rol, nombre, correo, numero, activo)
           VALUES ($4, $1, $2, $3, TRUE)
           RETURNING id_usuario, nombre, correo`,
          [body.nombre.trim(), body.correo.trim().toLowerCase(), body.numero.trim(), Number(body.id_rol)],
        );
        await client.query(
          `INSERT INTO empleado_contraseña (id_empleado, password_hash) VALUES ($1, $2)`,
          [userResult.rows[0].id_usuario, hashPassword(body.password.trim())],
        );
        return userResult.rows[0];
      });
      return { data: result, message: 'Empleado agregado' };
    } catch (error) {
      return databaseError(set, error);
    }
  }, {
    body: EmployeeBody,
    detail: { summary: 'Create employee', tags: ['Employees'] },
  })

  // ─── Sales ─────────────────────────────────────────────────────────────────

  .post('/api/sales', async ({ body, headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    try {
      const sale = await withTransaction(async (client) => {
        const header = await client.query<{ id_compra: number }>(
          `INSERT INTO compra (id_cliente, id_empleado, fecha_compra, metodo_pago, estado)
           VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 'pagada')
           RETURNING id_compra`,
          [body.id_cliente, body.id_empleado, body.metodo_pago.trim()],
        );
        const idCompra = header.rows[0].id_compra;

        for (const item of body.items) {
          const product = await client.query<{ id_producto: number; nombre_producto: string; precio: string; stock: number }>(
            `SELECT id_producto, nombre_producto, precio, stock
             FROM producto WHERE id_producto = $1 FOR UPDATE`,
            [item.id_producto],
          );
          if (product.rowCount === 0) throw new Error(`Producto ${item.id_producto} no existe`);
          const current = product.rows[0];
          if (current.stock < item.cantidad) {
            throw new Error(`Stock insuficiente para ${current.nombre_producto}. Disponible: ${current.stock}`);
          }
          await client.query(
            `UPDATE producto SET stock = stock - $1 WHERE id_producto = $2`,
            [item.cantidad, item.id_producto],
          );
          await client.query(
            `INSERT INTO detalle_compra (id_compra, id_producto, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4)`,
            [idCompra, item.id_producto, item.cantidad, current.precio],
          );
        }
        return { id_compra: idCompra };
      });
      return { data: sale, message: 'Venta registrada con transaccion COMMIT' };
    } catch (error) {
      return fail(set, error instanceof Error ? `ROLLBACK: ${error.message}` : 'ROLLBACK: error en venta', 400);
    }
  }, {
    body: SaleBody,
    detail: { summary: 'Register sale with transaction', tags: ['Sales'] },
  })

  // ─── Reports ───────────────────────────────────────────────────────────────

  .get('/api/reports/join/sales-detail', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT p.nombre_producto, p.grupo_kpop, cat.nombre_categoria,
              SUM(dc.cantidad) AS unidades_vendidas,
              COUNT(DISTINCT dc.id_compra) AS compras,
              SUM(dc.cantidad * dc.precio_unitario) AS total
       FROM detalle_compra dc
       JOIN producto p ON p.id_producto = dc.id_producto
       JOIN categoria cat ON cat.id_categoria = p.id_categoria
       GROUP BY p.id_producto, p.nombre_producto, p.grupo_kpop, cat.nombre_categoria
       ORDER BY total DESC LIMIT 100`,
    );
    return { data: result.rows };
  }, { detail: { summary: 'Sales by product (JOIN)', tags: ['Reports'] } })

  .get('/api/reports/join/inventory', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT pr.nombre_proveedor, pr.correo, pr.numero,
              COUNT(p.id_producto) AS productos,
              SUM(p.stock) AS unidades_disponibles,
              SUM(p.stock * p.precio) AS valor_inventario,
              MIN(p.stock) AS stock_minimo, MAX(p.stock) AS stock_maximo
       FROM producto p
       JOIN proveedor pr ON pr.id_proveedor = p.id_proveedor
       GROUP BY pr.id_proveedor, pr.nombre_proveedor, pr.correo, pr.numero
       ORDER BY valor_inventario DESC`,
    );
    return { data: result.rows };
  }, { detail: { summary: 'Inventory by provider (JOIN)', tags: ['Reports'] } })

  .get('/api/reports/join/customer-purchases', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT c.id_compra, cliente.nombre AS cliente, cn.nit,
              empleado.nombre AS empleado, c.fecha_compra,
              SUM(dc.cantidad * dc.precio_unitario) AS total
       FROM compra c
       JOIN usuario cliente ON cliente.id_usuario = c.id_cliente
       LEFT JOIN cliente_nit cn ON cn.id_cliente = cliente.id_usuario
       JOIN usuario empleado ON empleado.id_usuario = c.id_empleado
       JOIN detalle_compra dc ON dc.id_compra = c.id_compra
       GROUP BY c.id_compra, cliente.nombre, cn.nit, empleado.nombre, c.fecha_compra
       ORDER BY c.fecha_compra DESC LIMIT 50`,
    );
    return { data: result.rows };
  }, { detail: { summary: 'Customer purchase history (JOIN)', tags: ['Reports'] } })

  .get('/api/reports/subquery/low-stock', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT p.id_producto, p.nombre_producto, p.grupo_kpop, p.stock,
              ROUND((SELECT AVG(stock) FROM producto), 2) AS promedio_stock
       FROM producto p
       WHERE p.stock < (SELECT AVG(stock) FROM producto)
       ORDER BY p.stock ASC`,
    );
    return { data: result.rows };
  }, { detail: { summary: 'Low stock alert (subquery)', tags: ['Reports'] } })

  .get('/api/reports/subquery/frequent-customers', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT u.id_usuario, u.nombre, u.correo, cn.nit,
              COUNT(c.id_compra) AS compras
       FROM usuario u
       LEFT JOIN cliente_nit cn ON cn.id_cliente = u.id_usuario
       JOIN compra c ON c.id_cliente = u.id_usuario
       GROUP BY u.id_usuario, u.nombre, u.correo, cn.nit
       HAVING COUNT(c.id_compra) >= 2
       ORDER BY compras DESC, u.nombre`,
    );
    return { data: result.rows };
  }, { detail: { summary: 'Frequent customers (subquery)', tags: ['Reports'] } })

  .get('/api/reports/aggregate/category-sales', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT cat.nombre_categoria,
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
  }, { detail: { summary: 'Category sales (GROUP BY + HAVING)', tags: ['Reports'] } })

  .get('/api/reports/sales-summary', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query(
      `SELECT id_compra, fecha_compra, cliente, empleado, metodo_pago,
              estado, productos_distintos, unidades, total
       FROM vista_resumen_ventas
       ORDER BY fecha_compra DESC, id_compra DESC
       LIMIT 100`,
    );
    return { data: result.rows };
  }, { detail: { summary: 'Sales summary (VIEW)', tags: ['Reports'] } })

  .get('/api/reports/sales-summary.csv', async ({ headers, set }) => {
    if (!ensureAuth(headers.cookie, set)) return authError();
    const result = await query<Record<string, unknown>>(
      `SELECT TO_CHAR(fecha_compra, 'YYYY-MM-DD HH24:MI') AS "Fecha",
              cliente AS "Cliente", empleado AS "Empleado",
              metodo_pago AS "Metodo de pago", estado AS "Estado",
              productos_distintos AS "Productos", unidades AS "Unidades",
              'Q ' || TO_CHAR(total, 'FM999G999G990D00') AS "Total"
       FROM vista_resumen_ventas
       ORDER BY fecha_compra DESC, id_compra DESC
       LIMIT 100`,
    );
    set.headers['Content-Type'] = 'text/csv; charset=utf-8';
    set.headers['Content-Disposition'] = 'attachment; filename="kstore_galaxy_resumen_ventas.csv"';
    return `\uFEFF${toCsv(result.rows)}`;
  }, { detail: { summary: 'Export sales summary to CSV', tags: ['Reports'] } })

  .onError(({ error, set }) => {
    console.error(error);
    return fail(set, 'Error interno del servidor', 500);
  });

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(port);
console.log(`KStore Galaxy API escuchando en http://localhost:${port}`);
console.log(`Documentacion OpenAPI: http://localhost:${port}/openapi`);

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

// ─── Eden type export ─────────────────────────────────────────────────────────
// Import this type in the frontend for end-to-end type safety with Eden
export type App = typeof app;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureAuth(cookieHeader: string | undefined, set: RouteSet): boolean {
  return Boolean(getAuthenticatedUser(cookieHeader, set));
}

function getAuthenticatedUser(cookieHeader: string | undefined, set: RouteSet): SessionUser | null {
  const { user } = readSession(cookieHeader);
  if (!user) { fail(set, 'Debe iniciar sesion', 401); return null; }
  return user;
}

function ensureHighRole(cookieHeader: string | undefined, set: RouteSet): SessionUser | null {
  const user = getAuthenticatedUser(cookieHeader, set);
  if (!user) return null;
  if (!['Administrador', 'Supervisor de tienda', 'Gerente'].includes(user.nombre_rol)) {
    fail(set, 'Solo administradores, supervisores o gerentes pueden realizar esta accion', 403);
    return null;
  }
  return user;
}

function ensureAdmin(cookieHeader: string | undefined, set: RouteSet): SessionUser | null {
  const user = getAuthenticatedUser(cookieHeader, set);
  if (!user) return null;
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

function authError() { return { error: 'Debe iniciar sesion' }; }

function accessError(set: RouteSet) {
  return { error: set.status === 403 ? 'No tiene permisos para realizar esta accion' : 'Debe iniciar sesion' };
}

function databaseError(set: RouteSet, error: unknown) {
  const pgError = error as { code?: string; message?: string };
  if (pgError.code === '23505') return fail(set, 'Ya existe un registro con un valor unico repetido', 409);
  if (pgError.code === '23503') return fail(set, 'No se puede eliminar o guardar: el registro esta relacionado con otros datos', 409);
  if (pgError.code === '23514') return fail(set, 'Los datos no cumplen una regla de validacion de la base de datos', 400);
  console.error(error);
  return fail(set, pgError.message ?? 'Error de base de datos', 500);
}