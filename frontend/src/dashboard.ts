type User = {
  id_usuario: number;
  nombre: string;
  correo: string;
  nombre_rol: string;
};

type Category = {
  id_categoria: number;
  nombre_categoria: string;
  descripcion: string;
};

type Provider = {
  id_proveedor: number;
  nombre_proveedor: string;
  correo: string;
  numero: string;
};

type Product = {
  id_producto: number;
  nombre_producto: string;
  id_categoria: number;
  nombre_categoria: string;
  id_proveedor: number;
  nombre_proveedor: string;
  grupo_kpop: string;
  precio: string;
  stock: number;
  descripcion: string;
};

type Person = {
  id_usuario: number;
  nombre: string;
  correo: string;
  numero?: string;
  nit?: string;
  nombre_rol?: string;
};

type ApiRow = Record<string, string | number | boolean | null>;

type ApiResponse<T> = {
  data?: T;
  user?: User | null;
  message?: string;
  error?: string;
};

type Tab = 'products' | 'categories' | 'people' | 'sales' | 'reports';

type State = {
  user: User | null;
  tab: Tab;
  categories: Category[];
  products: Product[];
  providers: Provider[];
  customers: Person[];
  employees: Person[];
  editingProduct: Product | null;
  editingCategory: Category | null;
  reportKey: string;
  reportRows: ApiRow[];
  loading: boolean;
};

import { apiBase, request, requestList } from './api';
import { qs, qsa, escapeHtml, toTitleCase, headerLabel, formatCell, option } from './utils';
import { personPayload } from './people';
import { productPayload } from './products';
import { reports } from './reports';

// apiBase is re-exported from ./api for consistency
const appName = 'KStore Galaxy';

// reports are provided by ./reports

export function createDashboard(root: HTMLElement): void {
  let messageTimer: number | null = null;

  const state: State = {
    user: null,
    tab: 'products',
    categories: [],
    products: [],
    providers: [],
    customers: [],
    employees: [],
    editingProduct: null,
    editingCategory: null,
    reportKey: 'sales-summary',
    reportRows: [],
    loading: true,
  };

  void boot();

  async function boot(): Promise<void> {
    render();
    try {
      const session = await request<{ user: User | null }>('/auth/me');
      state.user = session.user ?? null;
      if (state.user) {
        await loadBaseData();
        await loadReport('sales-summary');
      }
    } catch {
      state.user = null;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadBaseData(): Promise<void> {
    const [categories, products, providers, customers, employees] = await Promise.all([
      requestList<Category>('/categories'),
      requestList<Product>('/products'),
      requestList<Provider>('/providers'),
      requestList<Person>('/customers'),
      requestList<Person>('/employees'),
    ]);

    state.categories = categories;
    state.products = products;
    state.providers = providers;
    state.customers = customers;
    state.employees = employees;
  }

  function render(): void {
    if (state.loading) {
      root.innerHTML = `<section class="loading">Cargando ${appName}...</section>`;
      return;
    }

    if (!state.user) {
      renderLogin();
      return;
    }

    renderApp();
  }

  function renderLogin(): void {
    root.innerHTML = `
      <section class="login-view">
        <div class="login-stage" aria-hidden="true">
          <div class="stage-line"></div>
          <div class="stage-line short"></div>
          <div class="stage-line hot"></div>
          <div class="brand-logo">
            <span>KStore</span>
            <strong>Galaxy</strong>
            <small>K-pop inventory studio</small>
          </div>
        </div>
        <form class="login-panel" id="login-form">
          <p class="eyebrow">Tienda de K-pop</p>
          <h1>${appName}</h1>
          <p class="login-copy">Inventario, ventas y reportes para una tienda con energia de comeback.</p>
          <label>
            Correo
            <input name="correo" type="email" value="emily@kstoregalaxy.gt" required />
          </label>
          <label>
            Password
            <input name="password" type="password" value="admin123" required />
          </label>
          ${messageHtml()}
          <button type="submit" class="primary">Iniciar sesion</button>
          <div class="login-credentials">
            <p class="hint">Admin Emily: emily@kstoregalaxy.gt / admin123</p>
            <p class="hint">Empleado Luis: luis.angel@kstoregalaxy.gt / empleado123</p>
          </div>
        </form>
      </section>
    `;

    qs<HTMLFormElement>('#login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const form = new FormData(formElement);

      try {
        const response = await request<{ user: User }>('/auth/login', {
          method: 'POST',
          body: {
            correo: String(form.get('correo') ?? ''),
            password: String(form.get('password') ?? ''),
          },
        });
        state.user = response.user;
        await loadBaseData();
        await loadReport('sales-summary');
        render();
        flash('ok', `Bienvenido, ${response.user.nombre}`);
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });
  }

  function renderApp(): void {
    root.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">${appName}</p>
          <h1>Backstage de inventario y ventas</h1>
          <div class="quick-stats">
            <span>${state.products.length} productos</span>
            <span>${state.customers.length} clientes</span>
            <span>${state.providers.length} proveedores</span>
          </div>
        </div>
        <div class="user-box">
          <span>${escapeHtml(state.user?.nombre ?? '')}</span>
          <small>${escapeHtml(state.user?.nombre_rol ?? '')}</small>
          <button id="logout-button" class="ghost">Salir</button>
        </div>
      </header>
      <nav class="tabs">
        ${tabButton('products', 'Productos')}
        ${tabButton('categories', 'Categorias')}
        ${tabButton('people', 'Clientes y equipo')}
        ${tabButton('sales', 'Venta transaccional')}
        ${tabButton('reports', 'Reportes SQL')}
      </nav>
      ${messageHtml()}
      <section class="workspace">
        ${sectionHtml()}
      </section>
    `;

    qs<HTMLButtonElement>('#logout-button').addEventListener('click', async () => {
      await request('/auth/logout', { method: 'POST' });
      if (messageTimer) window.clearTimeout(messageTimer);
      state.user = null;
      render();
    });

    qsa<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.tab = button.dataset.tab as Tab;
        state.editingProduct = null;
        state.editingCategory = null;
        if (state.tab === 'sales') {
          await loadReport('sales-summary');
        }
        render();
      });
    });

    if (state.tab === 'products') attachProductEvents();
    if (state.tab === 'categories') attachCategoryEvents();
    if (state.tab === 'people') attachPeopleEvents();
    if (state.tab === 'reports') attachReportEvents();
    if (state.tab === 'sales') attachSaleEvents();
    attachRowDetailEvents();
  }

  function sectionHtml(): string {
    if (state.tab === 'products') return productsHtml();
    if (state.tab === 'categories') return categoriesHtml();
    if (state.tab === 'people') return peopleHtml();
    if (state.tab === 'reports') return reportsHtml();
    return salesHtml();
  }

  function tabButton(tab: Tab, label: string): string {
    return `<button class="${state.tab === tab ? 'active' : ''}" data-tab="${tab}">${label}</button>`;
  }

  function productsHtml(): string {
    const editing = state.editingProduct;
    const canManageCatalog = isAdmin(state.user);
    return `
      <div class="${canManageCatalog ? 'split' : 'single-column'}">
        ${canManageCatalog ? `
          <form class="panel" id="product-form">
            <h2>${editing ? 'Editar producto' : 'Nuevo producto'}</h2>
            <label>Nombre
              <input name="nombre_producto" value="${escapeHtml(editing?.nombre_producto ?? '')}" required />
            </label>
            <label>Categoria
              <select name="id_categoria" required>
                ${state.categories.map((item) => option(item.id_categoria, item.nombre_categoria, editing?.id_categoria)).join('')}
              </select>
            </label>
            <label>Proveedor
              <select name="id_proveedor" required>
                ${state.providers.map((item) => option(item.id_proveedor, item.nombre_proveedor, editing?.id_proveedor)).join('')}
              </select>
            </label>
            <label>Grupo K-pop
              <input name="grupo_kpop" value="${escapeHtml(editing?.grupo_kpop ?? '')}" required />
            </label>
            <div class="two-cols">
              <label>Precio en Quetzales
                <input name="precio" type="number" min="0" step="0.01" value="${escapeHtml(editing?.precio ?? '')}" required />
              </label>
              <label>Stock
                <input name="stock" type="number" min="0" step="1" value="${editing?.stock ?? ''}" required />
              </label>
            </div>
            <label>Descripcion
              <textarea name="descripcion" required>${escapeHtml(editing?.descripcion ?? '')}</textarea>
            </label>
            <div class="actions">
              <button class="primary" type="submit">${editing ? 'Actualizar' : 'Crear'}</button>
              <button class="ghost" type="button" id="clear-product">Limpiar</button>
            </div>
          </form>
        ` : ''}
        <div class="panel wide">
          <div class="section-title">
            <h2>Productos</h2>
            <span>${state.products.length} registros</span>
          </div>
          ${tableHtml(
            state.products,
            ['nombre_producto', 'grupo_kpop', 'nombre_categoria', 'nombre_proveedor', 'precio', 'stock'],
            canManageCatalog ? productActions : undefined,
          )}
        </div>
      </div>
    `;
  }

  function productActions(row: Product): string {
    return `
      <button class="small" data-edit-product="${row.id_producto}">Editar</button>
      <button class="small danger" data-delete-product="${row.id_producto}">Eliminar</button>
    `;
  }

  function categoriesHtml(): string {
    const editing = state.editingCategory;
    const canManageCatalog = isAdmin(state.user);
    return `
      <div class="${canManageCatalog ? 'split compact' : 'single-column'}">
        ${canManageCatalog ? `
          <form class="panel" id="category-form">
            <h2>${editing ? 'Editar categoria' : 'Nueva categoria'}</h2>
            <label>Nombre
              <input name="nombre_categoria" value="${escapeHtml(editing?.nombre_categoria ?? '')}" required />
            </label>
            <label>Descripcion
              <textarea name="descripcion" required>${escapeHtml(editing?.descripcion ?? '')}</textarea>
            </label>
            <div class="actions">
              <button class="primary" type="submit">${editing ? 'Actualizar' : 'Crear'}</button>
              <button class="ghost" type="button" id="clear-category">Limpiar</button>
            </div>
          </form>
        ` : ''}
        <div class="panel wide">
          <div class="section-title">
            <h2>Categorias</h2>
            <span>${state.categories.length} registros</span>
          </div>
          ${tableHtml(state.categories, ['nombre_categoria', 'descripcion'], canManageCatalog ? categoryActions : undefined)}
        </div>
      </div>
    `;
  }

  function categoryActions(row: Category): string {
    return `
      <button class="small" data-edit-category="${row.id_categoria}">Editar</button>
      <button class="small danger" data-delete-category="${row.id_categoria}">Eliminar</button>
    `;
  }

  function peopleHtml(): string {
    const canManageTeam = isHighRole(state.user);
    return `
      <div class="people-grid">
        <form class="panel" id="customer-form">
          <h2>Nuevo cliente</h2>
          <label>Nombre
            <input name="nombre" required />
          </label>
          <label>Correo
            <input name="correo" type="email" required />
          </label>
          <div class="two-cols">
            <label>Telefono
              <input name="numero" required />
            </label>
            <label>NIT
              <input name="nit" placeholder="Opcional" />
            </label>
          </div>
          <button class="primary" type="submit">Agregar cliente</button>
        </form>

        ${canManageTeam ? `
          <form class="panel" id="employee-form">
            <h2>Nuevo empleado</h2>
            <p class="form-note">Alta para personal autorizado de tienda.</p>
            <label>Nombre
              <input name="nombre" required />
            </label>
            <label>Correo
              <input name="correo" type="email" required />
            </label>
            <label>Telefono
              <input name="numero" required />
            </label>
            <label>Rol
              <select name="id_rol" required>
                <option value="2">Empleado de caja</option>
                <option value="4">Supervisor de tienda</option>
                <option value="5">Gerente</option>
              </select>
            </label>
            <div class="password-group">
              <label>Contraseña</label>
              <div class="password-input-wrapper">
                <input name="password" type="password" placeholder="Escribe una contraseña" required />
                <button type="button" class="password-toggle-btn" data-password-toggle="employee">
                  Mostrar
                </button>
              </div>
            </div>
            <button class="primary" type="submit">Agregar empleado</button>
          </form>

          <form class="panel" id="provider-form">
            <h2>Nuevo proveedor</h2>
            <p class="form-note">Alta de distribuidor oficial o proveedor local.</p>
            <label>Nombre
              <input name="nombre_proveedor" required />
            </label>
            <label>Correo
              <input name="correo" type="email" required />
            </label>
            <label>Telefono
              <input name="numero" required />
            </label>
            <button class="primary" type="submit">Agregar proveedor</button>
          </form>
        ` : ''}
      </div>

      <div class="people-tables">
        <div class="panel wide">
          <div class="section-title">
            <h2>Clientes</h2>
            <span>${state.customers.length} registros</span>
          </div>
          ${tableHtml(state.customers, ['nombre', 'correo', 'nit'])}
        </div>
        <div class="panel wide">
          <div class="section-title">
            <h2>Equipo</h2>
            <span>${state.employees.length} registros</span>
          </div>
          ${tableHtml(state.employees, ['nombre', 'correo', 'nombre_rol'])}
        </div>
        <div class="panel wide">
          <div class="section-title">
            <h2>Proveedores</h2>
            <span>${state.providers.length} registros</span>
          </div>
          ${tableHtml(state.providers, ['nombre_proveedor', 'correo', 'numero'])}
        </div>
      </div>
    `;
  }

  function salesHtml(): string {
    return `
      <div class="split compact">
        <form class="panel" id="sale-form">
          <h2>Registrar venta</h2>
          <label>Cliente
            <select name="id_cliente" required>
              ${state.customers.map((item) => option(item.id_usuario, `${item.nombre} - ${item.nit || 'CF'}`)).join('')}
            </select>
          </label>
          <label>Empleado
            <select name="id_empleado" required>
              ${state.employees.map((item) => option(item.id_usuario, item.nombre, state.user?.id_usuario)).join('')}
            </select>
          </label>
          <label>Producto
            <select name="id_producto" required>
              ${state.products.map((item) => option(item.id_producto, `${item.nombre_producto} | stock ${item.stock}`)).join('')}
            </select>
          </label>
          <div class="two-cols">
            <label>Cantidad
              <input name="cantidad" type="number" min="1" step="1" value="1" required />
            </label>
            <label>Metodo de pago
              <select name="metodo_pago" required>
                <option value="efectivo">efectivo</option>
                <option value="tarjeta">tarjeta</option>
                <option value="transferencia">transferencia</option>
                <option value="paypal">paypal</option>
                <option value="cuotas">cuotas</option>
              </select>
            </label>
          </div>
          <button class="primary" type="submit">Guardar venta con transaccion</button>
        </form>
        <div class="panel wide">
          <h2>Ultimas ventas desde VIEW</h2>
          ${tableHtml(state.reportRows, ['fecha_compra', 'cliente', 'empleado', 'metodo_pago', 'unidades', 'total'])}
        </div>
      </div>
    `;
  }

  function reportsHtml(): string {
    const selected = reports.find((report) => report.key === state.reportKey) ?? reports[0];
    return `
      <div class="reports-layout">
        <aside class="panel report-menu">
          <h2>Consultas visibles</h2>
          ${reports.map((report) => `
            <button class="${state.reportKey === report.key ? 'selected' : ''}" data-report="${report.key}">
              <strong>${report.title}</strong>
            </button>
          `).join('')}
        </aside>
        <div class="panel wide">
          <div class="section-title">
            <div>
              <h2>${selected.title}</h2>
              <p>${selected.description}</p>
            </div>
            <div class="report-actions">
              <span>${state.reportRows.length} filas</span>
              ${selected.exportPath ? '<button class="primary export-button" id="export-csv" type="button">Descargar CSV</button>' : ''}
            </div>
          </div>
          ${tableHtml(state.reportRows)}
        </div>
      </div>
    `;
  }

  function attachProductEvents(): void {
    const form = document.querySelector<HTMLFormElement>('#product-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const payload = productPayload(new FormData(formElement));
      const path = state.editingProduct ? `/products/${state.editingProduct.id_producto}` : '/products';
      const method = state.editingProduct ? 'PUT' : 'POST';

      try {
        const response = await request<ApiResponse<unknown>>(path, { method, body: payload });
        await loadBaseData();
        state.editingProduct = null;
        render();
        flash('ok', response.message ?? 'Producto guardado');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });

    document.querySelector<HTMLButtonElement>('#clear-product')?.addEventListener('click', () => {
      state.editingProduct = null;
      render();
    });

    qsa<HTMLButtonElement>('[data-edit-product]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.editProduct);
        state.editingProduct = state.products.find((item) => item.id_producto === id) ?? null;
        render();
      });
    });

    qsa<HTMLButtonElement>('[data-delete-product]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.deleteProduct);
        if (!confirm('Eliminar este producto?')) return;

        try {
          const response = await request<ApiResponse<unknown>>(`/products/${id}`, { method: 'DELETE' });
          await loadBaseData();
          render();
          flash('ok', response.message ?? 'Producto eliminado');
        } catch (error) {
          flash('error', getErrorMessage(error));
        }
      });
    });
  }

  function attachCategoryEvents(): void {
    const form = document.querySelector<HTMLFormElement>('#category-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const form = new FormData(formElement);
      const payload = {
        nombre_categoria: String(form.get('nombre_categoria') ?? ''),
        descripcion: String(form.get('descripcion') ?? ''),
      };
      const path = state.editingCategory ? `/categories/${state.editingCategory.id_categoria}` : '/categories';
      const method = state.editingCategory ? 'PUT' : 'POST';

      try {
        const response = await request<ApiResponse<unknown>>(path, { method, body: payload });
        await loadBaseData();
        state.editingCategory = null;
        render();
        flash('ok', response.message ?? 'Categoria guardada');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });

    document.querySelector<HTMLButtonElement>('#clear-category')?.addEventListener('click', () => {
      state.editingCategory = null;
      render();
    });

    qsa<HTMLButtonElement>('[data-edit-category]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.editCategory);
        state.editingCategory = state.categories.find((item) => item.id_categoria === id) ?? null;
        render();
      });
    });

    qsa<HTMLButtonElement>('[data-delete-category]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = Number(button.dataset.deleteCategory);
        if (!confirm('Eliminar esta categoria?')) return;

        try {
          const response = await request<ApiResponse<unknown>>(`/categories/${id}`, { method: 'DELETE' });
          await loadBaseData();
          render();
          flash('ok', response.message ?? 'Categoria eliminada');
        } catch (error) {
          flash('error', getErrorMessage(error));
        }
      });
    });
  }

  function attachPeopleEvents(): void {
    // Attach password toggle handlers
    qsa<HTMLButtonElement>('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const input = button.closest('.password-input-wrapper')?.querySelector<HTMLInputElement>('input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        button.textContent = isPassword ? 'Ocultar' : 'Mostrar';
      });
    });

    qs<HTMLFormElement>('#customer-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const form = new FormData(formElement);

      try {
        const response = await request<ApiResponse<unknown>>('/customers', {
          method: 'POST',
          body: personPayload(form, true),
        });
        formElement.reset();
        await loadBaseData();
        render();
        flash('ok', response.message ?? 'Cliente agregado');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });

    const employeeForm = document.querySelector<HTMLFormElement>('#employee-form:not(.locked)');
    employeeForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const form = new FormData(formElement);

      try {
        const response = await request<ApiResponse<unknown>>('/employees', {
          method: 'POST',
          body: personPayload(form, false),
        });
        formElement.reset();
        await loadBaseData();
        render();
        flash('ok', response.message ?? 'Empleado agregado');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });

    const providerForm = document.querySelector<HTMLFormElement>('#provider-form:not(.locked)');
    providerForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const form = new FormData(formElement);

      try {
        const response = await request<ApiResponse<unknown>>('/providers', {
          method: 'POST',
          body: {
            nombre_proveedor: String(form.get('nombre_proveedor') ?? ''),
            correo: String(form.get('correo') ?? ''),
            numero: String(form.get('numero') ?? ''),
          },
        });
        formElement.reset();
        await loadBaseData();
        render();
        flash('ok', response.message ?? 'Proveedor agregado');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });
  }

  function attachReportEvents(): void {
    qsa<HTMLButtonElement>('[data-report]').forEach((button) => {
      button.addEventListener('click', async () => {
        await loadReport(button.dataset.report ?? 'sales-summary');
        render();
      });
    });

    document.querySelector<HTMLButtonElement>('#export-csv')?.addEventListener('click', async () => {
      try {
        const selected = reports.find((report) => report.key === state.reportKey);
        const exportPath = selected?.exportPath;
        if (!exportPath) {
          return;
        }

        const response = await fetch(`${apiBase}${exportPath}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'kstore_galaxy_resumen_ventas.csv';
        link.click();
        URL.revokeObjectURL(url);
        flash('ok', 'CSV exportado');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });
  }

  function attachSaleEvents(): void {
    qs<HTMLFormElement>('#sale-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formElement = event.currentTarget as HTMLFormElement;
      const form = new FormData(formElement);
      const payload = {
        id_cliente: Number(form.get('id_cliente')),
        id_empleado: Number(form.get('id_empleado')),
        metodo_pago: String(form.get('metodo_pago') ?? ''),
        items: [
          {
            id_producto: Number(form.get('id_producto')),
            cantidad: Number(form.get('cantidad')),
          },
        ],
      };

      try {
        const response = await request<ApiResponse<{ id_compra: number }>>('/sales', {
          method: 'POST',
          body: payload,
        });
        await loadBaseData();
        await loadReport('sales-summary');
        render();
        flash('ok', response.message ?? 'Venta registrada');
      } catch (error) {
        flash('error', getErrorMessage(error));
      }
    });
  }

  async function loadReport(key: string): Promise<void> {
    const report = reports.find((item) => item.key === key) ?? reports[0];
    const response = await requestList<ApiRow>(report.path);
    state.reportKey = report.key;
    state.reportRows = response;
  }

  function flash(type: 'ok' | 'error', text: string): void {
    if (messageTimer) {
      window.clearTimeout(messageTimer);
    }

    const toastRoot = document.getElementById('toast-root');
    if (!toastRoot) return;

    toastRoot.innerHTML = `<div class="message ${type}">${escapeHtml(text)}</div>`;
    messageTimer = window.setTimeout(() => {
      messageTimer = null;
      toastRoot.innerHTML = '';
    }, 4200);
  }

  function messageHtml(): string {
    return '<div id="toast-root" class="toast-root" aria-live="polite"></div>';
  }
}

// request and requestList are provided by ./api

// personPayload and productPayload are provided by ./people and ./products

function tableHtml<T extends Record<string, unknown>>(
  rows: T[],
  keys?: string[],
  actions?: (row: T) => string,
): string {
  if (rows.length === 0) {
    return '<div class="empty">Sin datos para mostrar.</div>';
  }

  const columns = (keys ?? Object.keys(rows[0])).filter((column) => !column.startsWith('id_'));
  const dataColumns = columns.join(',');
  return `
    <div class="table-wrap" data-columns="${dataColumns}">
      <table>
        <thead>
          <tr>
            ${columns.map((column) => `<th>${headerLabel(column)}</th>`).join('')}
            ${actions ? '<th>Acciones</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="clickable-row">
              ${columns.map((column) => `<td>${formatCell(row[column], column)}</td>`).join('')}
              ${actions ? `<td class="row-actions">${actions(row)}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function option(id: number, label: string, selected?: number): string {
  return `<option value="${id}" ${selected === id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function attachRowDetailEvents(): void {
  // Attach click handlers to all table rows to open a detail modal
  qsa<HTMLDivElement>('.table-wrap').forEach((wrap) => {
    const columns = (wrap.dataset.columns ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    wrap.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      // remove previous handler if any
      tr.onclick = null;
      tr.addEventListener('click', (event) => {
        // ignore clicks on actionable buttons inside the row
        if ((event.target as HTMLElement).closest('button')) return;

        const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>('td'));
        const obj: Record<string, string> = {};
        for (let i = 0; i < columns.length; i++) {
          const key = columns[i];
          const cell = cells[i];
          obj[key] = cell ? cell.textContent?.trim() ?? '' : '';
        }

        const title = columns[0] ? headerLabel(columns[0]) : 'Detalle';
        showDetailModal(title, obj);
      });
    });
  });
}

function showDetailModal(title: string, data: Record<string, string>): void {
  const overlay = document.createElement('div');
  overlay.className = 'detail-overlay';

  const items = Object.keys(data).map((key) => {
    return `
      <div class="detail-item">
        <strong>${headerLabel(key)}</strong>
        <div class="detail-value">${escapeHtml(data[key] ?? '')}</div>
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="detail-modal" role="dialog" aria-modal="true">
      <header>
        <h3>${escapeHtml(title)}</h3>
        <button id="detail-close" class="ghost">Cerrar</button>
      </header>
      <div class="detail-list">${items}</div>
    </div>
  `;

  function close() {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') close();
  }

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close();
  });

  overlay.querySelector<HTMLButtonElement>('#detail-close')?.addEventListener('click', () => close());
  window.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}
// headerLabel, toTitleCase, formatCell are provided by ./utils

function isHighRole(user: User | null): boolean {
  return Boolean(user && ['Administrador', 'Supervisor de tienda', 'Gerente'].includes(user.nombre_rol));
}

function isAdmin(user: User | null): boolean {
  return user?.nombre_rol === 'Administrador';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error inesperado';
}

// qs, qsa and escapeHtml are provided by ./utils
