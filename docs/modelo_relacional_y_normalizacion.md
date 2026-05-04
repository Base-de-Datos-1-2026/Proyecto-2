# Modelo Relacional y Normalización — KStore Galaxy

## 1. Modelo Relacional (Notación Relacional)

Cada relación se documenta con:
- Nombre de la tabla
- Atributos con tipo de dato
- Clave primaria subrayada
- Clave foránea indicada con → tabla referenciada

---

### rol
**rol**(<u>id_rol</u>: INTEGER, nombre_rol: VARCHAR(50) UNIQUE NOT NULL)

---

### usuario
**usuario**(<u>id_usuario</u>: INTEGER, id_rol: INTEGER NOT NULL → rol, nombre: VARCHAR(120) NOT NULL, correo: VARCHAR(120) UNIQUE NOT NULL, numero: VARCHAR(20) NOT NULL, activo: BOOLEAN NOT NULL DEFAULT TRUE)

---

### empleado_contraseña
**empleado_contraseña**(<u>id_empleado</u>: INTEGER → usuario ON DELETE CASCADE, password_hash: VARCHAR(64) NOT NULL)

> Relación 1:1 con `usuario`. Solo los empleados tienen contraseña. La clave primaria es también clave foránea.

---

### cliente_nit
**cliente_nit**(<u>id_cliente</u>: INTEGER → usuario, nit: VARCHAR(20) UNIQUE)

> Relación 1:1 con `usuario`. Solo los clientes tienen NIT (opcional). La clave primaria es también clave foránea.

---

### categoria
**categoria**(<u>id_categoria</u>: INTEGER, nombre_categoria: VARCHAR(100) UNIQUE NOT NULL, descripcion: TEXT NOT NULL)

---

### proveedor
**proveedor**(<u>id_proveedor</u>: INTEGER, nombre_proveedor: VARCHAR(120) NOT NULL, correo: VARCHAR(120) UNIQUE NOT NULL, numero: VARCHAR(20) NOT NULL)

---

### producto
**producto**(<u>id_producto</u>: INTEGER, nombre_producto: VARCHAR(140) NOT NULL, id_categoria: INTEGER NOT NULL → categoria, id_proveedor: INTEGER NOT NULL → proveedor, grupo_kpop: VARCHAR(80) NOT NULL, precio: NUMERIC(10,2) NOT NULL CHECK(precio >= 0), stock: INTEGER NOT NULL CHECK(stock >= 0), descripcion: TEXT NOT NULL)

---

### compra
**compra**(<u>id_compra</u>: INTEGER, id_cliente: INTEGER NOT NULL → usuario, id_empleado: INTEGER NOT NULL → usuario, fecha_compra: TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, metodo_pago: VARCHAR(30) NOT NULL, estado: VARCHAR(20) NOT NULL DEFAULT 'pagada' CHECK(estado IN ('pagada','anulada','pendiente')))

---

### detalle_compra
**detalle_compra**(<u>id_compra</u>: INTEGER → compra ON DELETE CASCADE, <u>id_producto</u>: INTEGER → producto, cantidad: INTEGER NOT NULL CHECK(cantidad > 0), precio_unitario: NUMERIC(10,2) NOT NULL CHECK(precio_unitario >= 0))

> Clave primaria compuesta: (id_compra, id_producto). Representa la relación M:N entre compra y producto.

---

## 3. Cardinalidades

| Relación | Cardinalidad | Descripción |
|---|---|---|
| rol → usuario | 1:N | Un rol puede tener muchos usuarios |
| usuario → empleado_contraseña | 1:1 | Un usuario empleado tiene una contraseña |
| usuario → cliente_nit | 1:1 | Un usuario cliente tiene un NIT opcional |
| usuario → compra (cliente) | 1:N | Un cliente puede tener muchas compras |
| usuario → compra (empleado) | 1:N | Un empleado puede atender muchas compras |
| categoria → producto | 1:N | Una categoría agrupa muchos productos |
| proveedor → producto | 1:N | Un proveedor suministra muchos productos |
| compra → detalle_compra | 1:N | Una compra tiene muchos detalles |
| producto → detalle_compra | 1:N | Un producto puede estar en muchos detalles |
| compra ↔ producto | M:N | Una compra incluye muchos productos; un producto aparece en muchas compras (resuelto por detalle_compra) |

---

## 4. Normalización hasta 3FN

### Tabla: `producto`

**Forma Original (sin normalizar):**
```
producto(id_producto, nombre_producto, id_categoria, nombre_categoria,
         descripcion_categoria, id_proveedor, nombre_proveedor,
         correo_proveedor, grupo_kpop, precio, stock, descripcion)
```

**1FN — Primera Forma Normal**
> Requisito: todos los atributos son atómicos, no hay grupos repetidos ni multivaluados.

✅ Todos los atributos son atómicos (un valor por celda). No hay listas ni grupos repetidos.
La tabla ya cumple 1FN.

**2FN — Segunda Forma Normal**
> Requisito: estar en 1FN y que todos los atributos no clave dependan totalmente de la clave primaria (sin dependencias parciales).

La clave primaria es `id_producto`. Detectamos dependencias parciales:
- `nombre_categoria`, `descripcion_categoria` → dependen de `id_categoria`, no de `id_producto`
- `nombre_proveedor`, `correo_proveedor` → dependen de `id_proveedor`, no de `id_producto`

**Solución:** extraer las entidades dependientes:

```
producto(id_producto, nombre_producto, id_categoria*, id_proveedor*,
         grupo_kpop, precio, stock, descripcion)

categoria(id_categoria, nombre_categoria, descripcion)
proveedor(id_proveedor, nombre_proveedor, correo, numero)
```

✅ La tabla ahora está en 2FN.

**3FN — Tercera Forma Normal**
> Requisito: estar en 2FN y que no existan dependencias transitivas (ningún atributo no clave depende de otro atributo no clave).

En `producto` revisamos: `grupo_kpop`, `precio`, `stock`, `descripcion` — todos dependen únicamente de `id_producto`. No hay dependencias transitivas.

✅ La tabla está en 3FN.

---

### Tabla: `compra`

**Forma Original:**
```
compra(id_compra, id_cliente, nombre_cliente, correo_cliente,
       id_empleado, nombre_empleado, fecha_compra, metodo_pago,
       estado, id_producto, cantidad, precio_unitario)
```

**1FN:**
- `id_producto`, `cantidad`, `precio_unitario` forman un grupo repetido (una compra puede tener varios productos).

**Solución:** separar los detalles:
```
compra(id_compra, id_cliente*, id_empleado*, fecha_compra, metodo_pago, estado)
detalle_compra(id_compra*, id_producto*, cantidad, precio_unitario)
```

✅ Cumple 1FN.

**2FN:**
- En `detalle_compra`, la clave primaria es `(id_compra, id_producto)`.
- `cantidad` y `precio_unitario` dependen de la clave compuesta completa, no de parte de ella.

✅ Cumple 2FN.

**3FN:**
- En `compra`: `nombre_cliente` y `correo_cliente` dependían transitivamente de `id_cliente`, no de `id_compra`.

**Solución:** ya está resuelta — los datos del cliente viven en `usuario`, referenciados por `id_cliente`.

✅ Cumple 3FN.

---

### Tabla: `usuario`

**Observación:** el diseño unifica clientes y empleados en una misma tabla, diferenciados por `id_rol`. Los datos extra exclusivos de cada subtipo se aíslan en tablas separadas:

- `empleado_contraseña(id_empleado, password_hash)` — solo empleados tienen contraseña
- `cliente_nit(id_cliente, nit)` — solo clientes tienen NIT

Esto evita valores NULL innecesarios en `usuario` y cumple 3FN: no hay atributos que dependan transitivamente de otro atributo no clave.

✅ La tabla `usuario` cumple 3FN.

---

### Resumen de Formas Normales

| Tabla | 1FN | 2FN | 3FN |
|---|---|---|---|
| rol | ✅ | ✅ | ✅ |
| usuario | ✅ | ✅ | ✅ |
| empleado_contraseña | ✅ | ✅ | ✅ |
| cliente_nit | ✅ | ✅ | ✅ |
| categoria | ✅ | ✅ | ✅ |
| proveedor | ✅ | ✅ | ✅ |
| producto | ✅ | ✅ | ✅ |
| compra | ✅ | ✅ | ✅ |
| detalle_compra | ✅ | ✅ | ✅ |

### Diagrama ER

![alt text](graphviz.png)