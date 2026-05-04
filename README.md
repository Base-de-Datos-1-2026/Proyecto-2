# KStore Galaxy

Sistema web para una tienda de K-pop: inventario, ventas, clientes, equipo, proveedores y reportes SQL reales. El proyecto usa PostgreSQL, backend con Elysia, frontend con Ripple y despliegue con Docker Compose.

## Inicio rapido

```bash
cp .env.example .env
docker compose up --build
```

Abrir:

- Frontend: http://localhost:5173
- API Health: http://localhost:3000/api/health
- Documentacion API (OpenAPI): http://localhost:3000/openapi

Credenciales para prueba:

- Admin: `emily@kstoregalaxy.gt` / `admin123`
- Empleado: `luis.angel@kstoregalaxy.gt` / `empleado123`

Si ya habias levantado una version anterior, recrea los datos:

```bash
docker compose down -v
docker compose up --build
```

## Que se puede hacer

- Iniciar y cerrar sesion.
- Crear, editar y eliminar productos solo con cuenta administradora.
- Crear, editar y eliminar categorias solo con cuenta administradora.
- Crear clientes desde cualquier cuenta de empleado.
- El NIT de cliente es opcional.
- Crear empleados y proveedores solo con rol alto: Administrador, Supervisor o Gerente.
- Registrar ventas con descuento de inventario dentro de una transaccion explicita.
- Ver reportes SQL desde la UI y exportar el resumen a CSV.
- Ver errores y validaciones directamente en pantalla.

## Reportes incluidos

- Ventas por producto: productos vendidos con unidades, compras e ingresos.
- Inventario por proveedor: una fila por proveedor con unidades y valor del inventario.
- Historial de clientes: consulta con JOIN de cliente, NIT, empleado y compra.
- Alertas de stock: consulta con subquery contra el promedio.
- Clientes frecuentes: clientes con dos o mas compras y conteo total de compras.
- Categorias estrella: `GROUP BY`, `HAVING`, `COUNT` y `SUM`.
- Resumen de ventas: consulta alimentada por `vista_resumen_ventas`.

## Endpoints API

Base URL: `http://localhost:3000`

### Autenticacion

| Metodo | Ruta | Descripcion | Requiere Auth |
|--------|------|-------------|---------------|
| `POST` | `/api/auth/login` | Inicia sesion con correo y contraseña | ✗ |
| `GET` | `/api/auth/me` | Obtiene usuario actual | ✓ |
| `POST` | `/api/auth/logout` | Cierra sesion | ✓ |

### Sistema

| Metodo | Ruta | Descripcion | Requiere Auth |
|--------|------|-------------|---------------|
| `GET` | `/api/health` | Health check del servidor | ✗ |
| `GET` | `/openapi` | Documentacion OpenAPI | ✗ |

### Categorias

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `GET` | `/api/categories` | Listar todas las categorias | Autenticado |
| `POST` | `/api/categories` | Crear categoria | Admin |
| `PUT` | `/api/categories/:id` | Actualizar categoria | Admin |
| `DELETE` | `/api/categories/:id` | Eliminar categoria | Admin |

### Productos

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `GET` | `/api/products` | Listar productos con detalles | Autenticado |
| `POST` | `/api/products` | Crear producto | Admin |
| `PUT` | `/api/products/:id` | Actualizar producto | Admin |
| `DELETE` | `/api/products/:id` | Eliminar producto | Admin |

### Proveedores

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `GET` | `/api/providers` | Listar proveedores | Autenticado |
| `POST` | `/api/providers` | Crear proveedor | Admin/Supervisor/Gerente |

### Clientes

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `GET` | `/api/customers` | Listar clientes | Autenticado |
| `POST` | `/api/customers` | Crear cliente | Autenticado |

### Empleados

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `GET` | `/api/employees` | Listar empleados | Autenticado |
| `POST` | `/api/employees` | Crear empleado | Admin/Supervisor/Gerente |

### Ventas

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `POST` | `/api/sales` | Registrar venta (con transaccion) | Autenticado |

### Reportes

| Metodo | Ruta | Descripcion | Permisos |
|--------|------|-------------|----------|
| `GET` | `/api/reports/join/sales-detail` | Ventas por producto (JOIN) | Autenticado |
| `GET` | `/api/reports/join/inventory` | Inventario por proveedor (JOIN) | Autenticado |
| `GET` | `/api/reports/join/customer-purchases` | Historial de clientes (JOIN) | Autenticado |
| `GET` | `/api/reports/subquery/low-stock` | Alertas de stock bajo (SUBQUERY) | Autenticado |
| `GET` | `/api/reports/subquery/frequent-customers` | Clientes frecuentes (SUBQUERY) | Autenticado |
| `GET` | `/api/reports/aggregate/category-sales` | Ventas por categoria (GROUP BY + HAVING) | Autenticado |
| `GET` | `/api/reports/sales-summary` | Resumen de ventas (VIEW) | Autenticado |
| `GET` | `/api/reports/sales-summary.csv` | Exportar resumen a CSV | Autenticado |

## Base de datos

Credenciales:

- Usuario: `proy2`
- Password: `secret`
- Base de datos: `kpop_store`

`database/db.sql` contiene DDL, claves primarias, claves foraneas, `NOT NULL`, checks, indices, vista y datos de prueba.

### Diagrama ER
![alt text](docs/graphviz.png)

## Estructura

```text
.
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   └── csv.ts
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── bun.lock
├── frontend/
│   ├── src/
│   │   ├── App.tsrx
│   │   ├── main.ts
│   │   ├── api.ts
│   │   ├── dashboard.ts
│   │   ├── people.ts
│   │   ├── products.ts
│   │   ├── reports.ts
│   │   ├── utils.ts
│   │   ├── styles.css
│   │   ├── tsrx-env.d.ts
│   │   └── vite-env.d.ts
│   ├── dist/
│   ├── Dockerfile
│   ├── index.html
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── bun.lock
├── database/
│   └── db.sql
├── docs/
│   ├── modelo_relacional_y_normalizacion.md
│   └── graphviz.png
├── package.json
├── docker-compose.yml
├── .env
├── .env.example
├── .gitignore
├── bun.lock
└── README.md
```