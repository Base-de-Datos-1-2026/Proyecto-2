export const reports = [
  {
    key: 'sales-detail',
    title: 'Ventas por producto',
    path: '/reports/join/sales-detail',
    description: 'Agrupa cada producto vendido con unidades, numero de compras e ingresos generados.',
  },
  {
    key: 'inventory',
    title: 'Inventario por proveedor',
    path: '/reports/join/inventory',
    description: 'Muestra una fila por proveedor con productos, unidades disponibles y valor total de inventario.',
  },
  {
    key: 'customer-purchases',
    title: 'Historial de clientes',
    path: '/reports/join/customer-purchases',
    description: 'Resume compras con cliente, NIT, empleado y detalle de venta.',
  },
  {
    key: 'low-stock',
    title: 'Alertas de stock',
    path: '/reports/subquery/low-stock',
    description: 'Detecta productos cuyo inventario esta por debajo del promedio general.',
  },
  {
    key: 'frequent-customers',
    title: 'Clientes frecuentes',
    path: '/reports/subquery/frequent-customers',
    description: 'Lista clientes que ya compraron al menos dos veces y muestra cuantas compras tiene cada uno.',
  },
  {
    key: 'category-sales',
    title: 'Categorias estrella',
    path: '/reports/aggregate/category-sales',
    description: 'Agrupa ventas por categoria y muestra solo las que superan Q100 vendidos.',
  },
  {
    key: 'sales-summary',
    title: 'Resumen de ventas',
    path: '/reports/sales-summary',
    description: 'Reporte alimentado por la vista vista_resumen_ventas para una lectura rapida del dia a dia.',
    exportPath: '/reports/sales-summary.csv',
  },
] as const;
