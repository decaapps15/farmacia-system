// inventario.js - Gestión de inventario
class InventarioManager {
    constructor() {
        this.currentProduct = null;
        this.products = [];
        this.filteredProducts = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.searchTerm = '';
        this.sortField = 'nombre';
        this.sortOrder = 'asc';
        this.init();
    }

    async init() {
        await this.checkPermissions();
        this.setupEventListeners();
        this.loadProducts();
        this.setupSearch();
        this.setupFilters();
    }

    async checkPermissions() {
        const employee = await db.getCurrentEmployee();
        if (!employee) {
            window.location.href = 'index.html';
            return;
        }

        const allowedRoles = ['admin', 'almacen'];
        if (!allowedRoles.includes(employee.rol)) {
            window.location.href = 'dashboard.html';
            return;
        }
    }

    async loadProducts(page = 1) {
        try {
            this.currentPage = page;
            
            // Mostrar loading
            this.showLoading();
            
            let query = supabase
                .from('productos')
                .select('*')
                .eq('activo', true)
                .order(this.sortField, { ascending: this.sortOrder === 'asc' });

            // Aplicar búsqueda si existe
            if (this.searchTerm) {
                query = query.or(`nombre.ilike.%${this.searchTerm}%,codigo.ilike.%${this.searchTerm}%`);
            }

            // Aplicar paginación
            const from = (page - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data: products, error, count } = await query;

            if (error) throw error;

            this.products = products || [];
            this.filteredProducts = [...this.products];
            
            // Obtener total de productos para paginación
            const { count: totalCount } = await supabase
                .from('productos')
                .select('*', { count: 'exact', head: true })
                .eq('activo', true);

            this.totalProducts = totalCount || 0;
            
            this.renderProducts();
            this.renderPagination();
            
        } catch (error) {
            console.error('Error loading products:', error);
            this.showError('Error cargando productos');
        }
    }

    renderProducts() {
        const container = document.getElementById('productosContainer');
        if (!container) return;

        if (this.products.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <h3>No hay productos</h3>
                    <p>${this.searchTerm ? 'No se encontraron productos con esa búsqueda' : 'Comienza agregando tu primer producto'}</p>
                    ${!this.searchTerm ? `
                        <button class="btn btn-primary" onclick="inventario.showAddProductModal()">
                            <i class="fas fa-plus"></i> Agregar Producto
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }

        const productsHtml = this.products.map(product => `
            <div class="product-card" data-product-id="${product.id}">
                <div class="product-header">
                    <div class="product-code">${product.codigo}</div>
                    <div class="product-actions">
                        <button class="btn-icon" onclick="inventario.showEditProductModal('${product.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="inventario.showStockModal('${product.id}')">
                            <i class="fas fa-boxes"></i>
                        </button>
                        <button class="btn-icon btn-danger" onclick="inventario.confirmDeleteProduct('${product.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="product-body">
                    <h4 class="product-name">${product.nombre}</h4>
                    ${product.descripcion ? `<p class="product-description">${product.descripcion}</p>` : ''}
                    
                    <div class="product-stats">
                        <div class="stat-item">
                            <span class="stat-label">Unidades:</span>
                            <span class="stat-value ${product.unidades_sueltas < (product.stock_minimo || 10) ? 'text-danger' : ''}">
                                ${product.unidades_sueltas}
                            </span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Paquetes:</span>
                            <span class="stat-value">${product.paquetes}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Por paquete:</span>
                            <span class="stat-value">${product.unidades_por_paquete}</span>
                        </div>
                    </div>
                    
                    <div class="product-prices">
                        <div class="price-item">
                            <span class="price-label">Precio unitario:</span>
                            <span class="price-value">$${product.precio_unitario.toFixed(2)}</span>
                        </div>
                        <div class="price-item">
                            <span class="price-label">Precio paquete:</span>
                            <span class="price-value">$${product.precio_paquete.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    ${product.requiere_receta ? `
                        <div class="product-warning">
                            <i class="fas fa-prescription"></i>
                            <span>Requiere receta médica</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="product-footer">
                    <div class="product-meta">
                        <span class="meta-item">
                            <i class="fas fa-calendar"></i>
                            ${utils.formatDate(product.creado_en, 'short')}
                        </span>
                        <span class="meta-item">
                            <i class="fas fa-user"></i>
                            ${product.creado_por ? 'Usuario' : 'Sistema'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = productsHtml;
    }

    renderPagination() {
        const paginationContainer = document.getElementById('paginationContainer');
        if (!paginationContainer) return;

        const totalPages = Math.ceil(this.totalProducts / this.itemsPerPage);
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHtml = `
            <div class="pagination">
                <button class="page-btn ${this.currentPage === 1 ? 'disabled' : ''}" 
                        onclick="inventario.loadProducts(${this.currentPage - 1})" 
                        ${this.currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
        `;

        // Mostrar números de página
        const maxVisible = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        if (endPage - startPage + 1 < maxVisible) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            paginationHtml += `
                <button class="page-btn" onclick="inventario.loadProducts(1)">1</button>
                ${startPage > 2 ? '<span class="page-dots">...</span>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="page-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="inventario.loadProducts(${i})">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            paginationHtml += `
                ${endPage < totalPages - 1 ? '<span class="page-dots">...</span>' : ''}
                <button class="page-btn" onclick="inventario.loadProducts(${totalPages})">
                    ${totalPages}
                </button>
            `;
        }

        paginationHtml += `
                <button class="page-btn ${this.currentPage === totalPages ? 'disabled' : ''}" 
                        onclick="inventario.loadProducts(${this.currentPage + 1})" 
                        ${this.currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="pagination-info">
                Mostrando ${((this.currentPage - 1) * this.itemsPerPage) + 1} - 
                ${Math.min(this.currentPage * this.itemsPerPage, this.totalProducts)} 
                de ${this.totalProducts} productos
            </div>
        `;

        paginationContainer.innerHTML = paginationHtml;
    }

    showAddProductModal() {
        const modalContent = `
            <form id="addProductForm" class="product-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="productCode">
                            <i class="fas fa-barcode"></i> Código del Producto *
                        </label>
                        <input type="text" id="productCode" name="codigo" required 
                               placeholder="EJ: MED-001" maxlength="50">
                        <div class="form-help">Código único para identificar el producto</div>
                    </div>
                    
                    <div class="form-group">
                        <label for="productName">
                            <i class="fas fa-pills"></i> Nombre del Producto *
                        </label>
                        <input type="text" id="productName" name="nombre" required 
                               placeholder="Ej: Paracetamol 500mg" maxlength="200">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="productDescription">
                        <i class="fas fa-align-left"></i> Descripción
                    </label>
                    <textarea id="productDescription" name="descripcion" 
                              rows="3" placeholder="Descripción detallada del producto..."></textarea>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="productUnit">
                            <i class="fas fa-balance-scale"></i> Unidad de Medida *
                        </label>
                        <select id="productUnit" name="unidad_medida" required>
                            <option value="">Seleccionar...</option>
                            <option value="tabletas">Tabletas</option>
                            <option value="capsulas">Cápsulas</option>
                            <option value="ml">Mililitros (ml)</option>
                            <option value="mg">Miligramos (mg)</option>
                            <option value="g">Gramos (g)</option>
                            <option value="unidad">Unidad</option>
                            <option value="caja">Caja</option>
                            <option value="frasco">Frasco</option>
                            <option value="tubo">Tubo</option>
                            <option value="ampolla">Ampolla</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="productUnitPrice">
                            <i class="fas fa-dollar-sign"></i> Precio Unitario *
                        </label>
                        <input type="number" id="productUnitPrice" name="precio_unitario" 
                               required min="0" step="0.01" placeholder="0.00">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="productUnitsPerPack">
                            <i class="fas fa-box"></i> Unidades por Paquete *
                        </label>
                        <input type="number" id="productUnitsPerPack" name="unidades_por_paquete" 
                               required min="1" placeholder="Ej: 10">
                    </div>
                    
                    <div class="form-group">
                        <label for="productPackPrice">
                            <i class="fas fa-dollar-sign"></i> Precio por Paquete *
                        </label>
                        <input type="number" id="productPackPrice" name="precio_paquete" 
                               required min="0" step="0.01" placeholder="0.00">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="productInitialUnits">
                            <i class="fas fa-box-open"></i> Unidades Iniciales
                        </label>
                        <input type="number" id="productInitialUnits" name="unidades_sueltas" 
                               min="0" value="0" placeholder="0">
                    </div>
                    
                    <div class="form-group">
                        <label for="productInitialPacks">
                            <i class="fas fa-boxes"></i> Paquetes Iniciales
                        </label>
                        <input type="number" id="productInitialPacks" name="paquetes" 
                               min="0" value="0" placeholder="0">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="productMinStock">
                            <i class="fas fa-exclamation-triangle"></i> Stock Mínimo
                        </label>
                        <input type="number" id="productMinStock" name="stock_minimo" 
                               min="1" value="10" placeholder="10">
                        <div class="form-help">Alerta cuando las unidades estén por debajo de este número</div>
                    </div>
                    
                    <div class="form-group">
                        <label for="productRequiresPrescription">
                            <i class="fas fa-prescription"></i> Requiere Receta
                        </label>
                        <div class="checkbox-group">
                            <input type="checkbox" id="productRequiresPrescription" name="requiere_receta">
                            <label for="productRequiresPrescription" class="checkbox-label">
                                Este producto requiere receta médica
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="utils.closeModal('addProductModal')">
                        Cancelar
                    </button>
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> Guardar Producto
                    </button>
                </div>
            </form>
        `;

        const modalId = utils.showModal('Agregar Nuevo Producto', modalContent, {
            id: 'addProductModal',
            footer: ''
        });

        this.setupProductForm('addProductForm', 'add');
    }

    async showEditProductModal(productId) {
        try {
            const { data: product, error } = await supabase
                .from('productos')
                .select('*')
                .eq('id', productId)
                .single();

            if (error) throw error;

            this.currentProduct = product;

            const modalContent = `
                <form id="editProductForm" class="product-form">
                    <input type="hidden" id="editProductId" name="id" value="${product.id}">
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editProductCode">
                                <i class="fas fa-barcode"></i> Código del Producto *
                            </label>
                            <input type="text" id="editProductCode" name="codigo" required 
                                   value="${product.codigo}" maxlength="50">
                        </div>
                        
                        <div class="form-group">
                            <label for="editProductName">
                                <i class="fas fa-pills"></i> Nombre del Producto *
                            </label>
                            <input type="text" id="editProductName" name="nombre" required 
                                   value="${product.nombre}" maxlength="200">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="editProductDescription">
                            <i class="fas fa-align-left"></i> Descripción
                        </label>
                        <textarea id="editProductDescription" name="descripcion" rows="3">${product.descripcion || ''}</textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editProductUnit">
                                <i class="fas fa-balance-scale"></i> Unidad de Medida *
                            </label>
                            <select id="editProductUnit" name="unidad_medida" required>
                                <option value="">Seleccionar...</option>
                                <option value="tabletas" ${product.unidad_medida === 'tabletas' ? 'selected' : ''}>Tabletas</option>
                                <option value="capsulas" ${product.unidad_medida === 'capsulas' ? 'selected' : ''}>Cápsulas</option>
                                <option value="ml" ${product.unidad_medida === 'ml' ? 'selected' : ''}>Mililitros (ml)</option>
                                <option value="mg" ${product.unidad_medida === 'mg' ? 'selected' : ''}>Miligramos (mg)</option>
                                <option value="g" ${product.unidad_medida === 'g' ? 'selected' : ''}>Gramos (g)</option>
                                <option value="unidad" ${product.unidad_medida === 'unidad' ? 'selected' : ''}>Unidad</option>
                                <option value="caja" ${product.unidad_medida === 'caja' ? 'selected' : ''}>Caja</option>
                                <option value="frasco" ${product.unidad_medida === 'frasco' ? 'selected' : ''}>Frasco</option>
                                <option value="tubo" ${product.unidad_medida === 'tubo' ? 'selected' : ''}>Tubo</option>
                                <option value="ampolla" ${product.unidad_medida === 'ampolla' ? 'selected' : ''}>Ampolla</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="editProductUnitPrice">
                                <i class="fas fa-dollar-sign"></i> Precio Unitario *
                            </label>
                            <input type="number" id="editProductUnitPrice" name="precio_unitario" 
                                   required min="0" step="0.01" value="${product.precio_unitario}">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editProductUnitsPerPack">
                                <i class="fas fa-box"></i> Unidades por Paquete *
                            </label>
                            <input type="number" id="editProductUnitsPerPack" name="unidades_por_paquete" 
                                   required min="1" value="${product.unidades_por_paquete}">
                        </div>
                        
                        <div class="form-group">
                            <label for="editProductPackPrice">
                                <i class="fas fa-dollar-sign"></i> Precio por Paquete *
                            </label>
                            <input type="number" id="editProductPackPrice" name="precio_paquete" 
                                   required min="0" step="0.01" value="${product.precio_paquete}">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editProductMinStock">
                                <i class="fas fa-exclamation-triangle"></i> Stock Mínimo
                            </label>
                            <input type="number" id="editProductMinStock" name="stock_minimo" 
                                   min="1" value="${product.stock_minimo || 10}">
                        </div>
                        
                        <div class="form-group">
                            <label for="editProductRequiresPrescription">
                                <i class="fas fa-prescription"></i> Requiere Receta
                            </label>
                            <div class="checkbox-group">
                                <input type="checkbox" id="editProductRequiresPrescription" name="requiere_receta" 
                                       ${product.requiere_receta ? 'checked' : ''}>
                                <label for="editProductRequiresPrescription" class="checkbox-label">
                                    Este producto requiere receta médica
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="utils.closeModal('editProductModal')">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Actualizar Producto
                        </button>
                    </div>
                </form>
            `;

            const modalId = utils.showModal('Editar Producto', modalContent, {
                id: 'editProductModal',
                footer: ''
            });

            this.setupProductForm('editProductForm', 'edit');

        } catch (error) {
            console.error('Error loading product for edit:', error);
            utils.showNotification('Error cargando producto', 'error');
        }
    }

    setupProductForm(formId, action) {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const productData = Object.fromEntries(formData.entries());
            
            // Convertir valores numéricos
            productData.precio_unitario = parseFloat(productData.precio_unitario);
            productData.precio_paquete = parseFloat(productData.precio_paquete);
            productData.unidades_por_paquete = parseInt(productData.unidades_por_paquete);
            productData.stock_minimo = parseInt(productData.stock_minimo) || 10;
            productData.requiere_receta = form.querySelector('[name="requiere_receta"]').checked;
            
            if (action === 'add') {
                productData.unidades_sueltas = parseInt(productData.unidades_sueltas) || 0;
                productData.paquetes = parseInt(productData.paquetes) || 0;
            }

            try {
                const employee = await db.getCurrentEmployee();
                
                if (action === 'add') {
                    productData.creado_por = employee.id;
                    
                    const { data, error } = await supabase
                        .from('productos')
                        .insert([productData])
                        .select()
                        .single();

                    if (error) throw error;
                    
                    // Registrar movimiento de inventario si hay stock inicial
                    if (productData.unidades_sueltas > 0 || productData.paquetes > 0) {
                        await this.registerInventoryMovement(
                            data.id,
                            employee.id,
                            'entrada',
                            'Stock inicial',
                            productData.unidades_sueltas,
                            productData.paquetes,
                            0,
                            0
                        );
                    }
                    
                    utils.showNotification('Producto agregado exitosamente', 'success');
                    
                } else if (action === 'edit') {
                    const { error } = await supabase
                        .from('productos')
                        .update(productData)
                        .eq('id', productData.id);

                    if (error) throw error;
                    
                    utils.showNotification('Producto actualizado exitosamente', 'success');
                }

                utils.closeModal(`${action}ProductModal`);
                await this.loadProducts(this.currentPage);
                
            } catch (error) {
                console.error(`Error ${action} product:`, error);
                
                if (error.code === '23505') { // Unique violation
                    utils.showNotification('El código del producto ya existe', 'error');
                } else {
                    utils.showNotification(`Error al ${action === 'add' ? 'agregar' : 'actualizar'} producto`, 'error');
                }
            }
        });
    }

    async showStockModal(productId) {
        try {
            const { data: product, error } = await supabase
                .from('productos')
                .select('*')
                .eq('id', productId)
                .single();

            if (error) throw error;

            this.currentProduct = product;

            const modalContent = `
                <div class="stock-modal">
                    <div class="current-stock-info">
                        <h4>Stock Actual</h4>
                        <div class="stock-grid">
                            <div class="stock-item">
                                <span class="stock-label">Unidades Sueltas:</span>
                                <span class="stock-value">${product.unidades_sueltas}</span>
                            </div>
                            <div class="stock-item">
                                <span class="stock-label">Paquetes:</span>
                                <span class="stock-value">${product.paquetes}</span>
                            </div>
                            <div class="stock-item">
                                <span class="stock-label">Unidades por Paquete:</span>
                                <span class="stock-value">${product.unidades_por_paquete}</span>
                            </div>
                            <div class="stock-item">
                                <span class="stock-label">Total Unidades:</span>
                                <span class="stock-value">${product.unidades_sueltas + (product.paquetes * product.unidades_por_paquete)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="stock-actions">
                        <h4>Gestionar Stock</h4>
                        <form id="stockForm" class="stock-form">
                            <input type="hidden" id="stockProductId" value="${product.id}">
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="stockAction">
                                        <i class="fas fa-exchange-alt"></i> Acción *
                                    </label>
                                    <select id="stockAction" name="accion" required>
                                        <option value="">Seleccionar acción...</option>
                                        <option value="entrada">Entrada (Agregar stock)</option>
                                        <option value="salida">Salida (Reducir stock)</option>
                                        <option value="ajuste">Ajuste (Corregir stock)</option>
                                    </select>
                                </div>
                                
                                <div class="form-group">
                                    <label for="stockReason">
                                        <i class="fas fa-clipboard"></i> Motivo *
                                    </label>
                                    <select id="stockReason" name="motivo" required>
                                        <option value="">Seleccionar motivo...</option>
                                        <option value="compra">Compra a proveedor</option>
                                        <option value="devolucion">Devolución de cliente</option>
                                        <option value="venta">Venta</option>
                                        <option value="perdida">Pérdida/daño</option>
                                        <option value="caducidad">Caducidad</option>
                                        <option value="ajuste_inventario">Ajuste de inventario</option>
                                        <option value="transferencia">Transferencia entre sucursales</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="stockUnits">
                                        <i class="fas fa-box-open"></i> Unidades Sueltas
                                    </label>
                                    <input type="number" id="stockUnits" name="unidades" 
                                           min="0" value="0" placeholder="0">
                                </div>
                                
                                <div class="form-group">
                                    <label for="stockPacks">
                                        <i class="fas fa-boxes"></i> Paquetes
                                    </label>
                                    <input type="number" id="stockPacks" name="paquetes" 
                                           min="0" value="0" placeholder="0">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="stockNotes">
                                    <i class="fas fa-sticky-note"></i> Notas Adicionales
                                </label>
                                <textarea id="stockNotes" name="notas" rows="2" 
                                          placeholder="Notas adicionales sobre el movimiento..."></textarea>
                            </div>
                            
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" onclick="utils.closeModal('stockModal')">
                                    Cancelar
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-check"></i> Aplicar Movimiento
                                </button>
                            </div>
                        </form>
                    </div>
                    
                    <div class="stock-history">
                        <h4>Últimos Movimientos</h4>
                        <div id="stockHistoryList" class="history-list">
                            <div class="loading-history">
                                <i class="fas fa-spinner fa-spin"></i>
                                <span>Cargando historial...</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const modalId = utils.showModal(`Gestionar Stock: ${product.nombre}`, modalContent, {
                id: 'stockModal',
                footer: ''
            });

            this.setupStockForm();
            this.loadStockHistory(productId);

        } catch (error) {
            console.error('Error loading product for stock management:', error);
            utils.showNotification('Error cargando información del producto', 'error');
        }
    }

    setupStockForm() {
        const form = document.getElementById('stockForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const stockData = Object.fromEntries(formData.entries());
            const productId = document.getElementById('stockProductId').value;
            
            const unidades = parseInt(stockData.unidades) || 0;
            const paquetes = parseInt(stockData.paquetes) || 0;
            
            if (unidades === 0 && paquetes === 0) {
                utils.showNotification('Debe especificar al menos unidades o paquetes', 'error');
                return;
            }

            try {
                const employee = await db.getCurrentEmployee();
                const { data: product, error: productError } = await supabase
                    .from('productos')
                    .select('*')
                    .eq('id', productId)
                    .single();

                if (productError) throw productError;

                // Validar salidas
                if (stockData.accion === 'salida') {
                    if (unidades > product.unidades_sueltas) {
                        utils.showNotification(`No hay suficientes unidades. Disponibles: ${product.unidades_sueltas}`, 'error');
                        return;
                    }
                    if (paquetes > product.paquetes) {
                        utils.showNotification(`No hay suficientes paquetes. Disponibles: ${product.paquetes}`, 'error');
                        return;
                    }
                }

                // Calcular nuevos valores
                let nuevasUnidades = product.unidades_sueltas;
                let nuevosPaquetes = product.paquetes;

                switch (stockData.accion) {
                    case 'entrada':
                        nuevasUnidades += unidades;
                        nuevosPaquetes += paquetes;
                        break;
                    case 'salida':
                        nuevasUnidades -= unidades;
                        nuevosPaquetes -= paquetes;
                        break;
                    case 'ajuste':
                        nuevasUnidades = unidades;
                        nuevosPaquetes = paquetes;
                        break;
                }

                // Actualizar producto
                const { error: updateError } = await supabase
                    .from('productos')
                    .update({
                        unidades_sueltas: nuevasUnidades,
                        paquetes: nuevosPaquetes,
                        actualizado_en: new Date().toISOString()
                    })
                    .eq('id', productId);

                if (updateError) throw updateError;

                // Registrar movimiento
                await this.registerInventoryMovement(
                    productId,
                    employee.id,
                    stockData.accion,
                    stockData.motivo + (stockData.notas ? `: ${stockData.notas}` : ''),
                    stockData.accion === 'entrada' ? unidades : -unidades,
                    stockData.accion === 'entrada' ? paquetes : -paquetes,
                    product.unidades_sueltas,
                    product.paquetes
                );

                utils.showNotification('Movimiento de stock registrado exitosamente', 'success');
                utils.closeModal('stockModal');
                
                // Recargar productos
                await this.loadProducts(this.currentPage);

            } catch (error) {
                console.error('Error updating stock:', error);
                utils.showNotification('Error actualizando stock', 'error');
            }
        });
    }

    async registerInventoryMovement(productId, empleadoId, tipo, motivo, unidades, paquetes, stockAnteriorUnidades, stockAnteriorPaquetes) {
        try {
            const { error } = await supabase
                .from('movimientos_inventario')
                .insert({
                    producto_id: productId,
                    empleado_id: empleadoId,
                    tipo_movimiento: tipo,
                    motivo: motivo,
                    unidades_sueltas: unidades,
                    paquetes: paquetes,
                    stock_anterior_unidades: stockAnteriorUnidades,
                    stock_anterior_paquetes: stockAnteriorPaquetes
                });

            if (error) throw error;

        } catch (error) {
            console.error('Error registering inventory movement:', error);
            throw error;
        }
    }

    async loadStockHistory(productId) {
        try {
            const historyList = document.getElementById('stockHistoryList');
            if (!historyList) return;

            const { data: movements, error } = await supabase
                .from('movimientos_inventario')
                .select(`
                    *,
                    empleados:empleados!movimientos_inventario_empleado_id_fkey(nombre)
                `)
                .eq('producto_id', productId)
                .order('creado_en', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!movements || movements.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-history">
                        <i class="fas fa-history"></i>
                        <span>No hay movimientos registrados</span>
                    </div>
                `;
                return;
            }

            const historyHtml = movements.map(movement => `
                <div class="history-item ${movement.tipo_movimiento}">
                    <div class="history-header">
                        <span class="history-type ${movement.tipo_movimiento}">
                            <i class="fas fa-${movement.tipo_movimiento === 'entrada' ? 'arrow-down' : movement.tipo_movimiento === 'salida' ? 'arrow-up' : 'exchange-alt'}"></i>
                            ${movement.tipo_movimiento.toUpperCase()}
                        </span>
                        <span class="history-date">${utils.formatDate(movement.creado_en, 'short')}</span>
                    </div>
                    
                    <div class="history-body">
                        <div class="history-reason">${movement.motivo}</div>
                        <div class="history-details">
                            ${movement.unidades_sueltas !== 0 ? `
                                <span class="detail-item">
                                    <i class="fas fa-box-open"></i>
                                    ${movement.unidades_sueltas > 0 ? '+' : ''}${movement.unidades_sueltas} unidades
                                </span>
                            ` : ''}
                            
                            ${movement.paquetes !== 0 ? `
                                <span class="detail-item">
                                    <i class="fas fa-boxes"></i>
                                    ${movement.paquetes > 0 ? '+' : ''}${movement.paquetes} paquetes
                                </span>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="history-footer">
                        <span class="history-employee">
                            <i class="fas fa-user"></i>
                            ${movement.empleados?.nombre || 'Sistema'}
                        </span>
                        <span class="history-total">
                            Total: ${movement.unidades_totales} unidades
                        </span>
                    </div>
                </div>
            `).join('');

            historyList.innerHTML = historyHtml;

        } catch (error) {
            console.error('Error loading stock history:', error);
            const historyList = document.getElementById('stockHistoryList');
            if (historyList) {
                historyList.innerHTML = `
                    <div class="error-history">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Error cargando historial</span>
                    </div>
                `;
            }
        }
    }

    async confirmDeleteProduct(productId) {
        const confirmed = await utils.showConfirm(
            'Eliminar Producto',
            '¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.',
            {
                okText: 'Eliminar',
                cancelText: 'Cancelar'
            }
        );

        if (confirmed) {
            await this.deleteProduct(productId);
        }
    }

    async deleteProduct(productId) {
        try {
            const { error } = await supabase
                .from('productos')
                .update({ activo: false })
                .eq('id', productId);

            if (error) throw error;

            utils.showNotification('Producto eliminado exitosamente', 'success');
            await this.loadProducts(this.currentPage);

        } catch (error) {
            console.error('Error deleting product:', error);
            utils.showNotification('Error eliminando producto', 'error');
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('searchProducts');
        if (!searchInput) return;

        // Buscar en tiempo real con debounce
        const searchHandler = utils.debounce((e) => {
            this.searchTerm = e.target.value.trim();
            this.loadProducts(1);
        }, 300);

        searchInput.addEventListener('input', searchHandler);
    }

    setupFilters() {
        const sortSelect = document.getElementById('sortProducts');
        if (!sortSelect) return;

        sortSelect.addEventListener('change', (e) => {
            const [field, order] = e.target.value.split('_');
            this.sortField = field;
            this.sortOrder = order;
            this.loadProducts(1);
        });

        const filterLowStock = document.getElementById('filterLowStock');
        if (filterLowStock) {
            filterLowStock.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    await this.filterLowStockProducts();
                } else {
                    await this.loadProducts(1);
                }
            });
        }
    }

    async filterLowStockProducts() {
        try {
            const { data: products, error } = await supabase
                .from('productos')
                .select('*')
                .lt('unidades_sueltas', 10)
                .eq('activo', true)
                .order('unidades_sueltas', { ascending: true });

            if (error) throw error;

            this.products = products || [];
            this.renderProducts();

            // Limpiar paginación
            const paginationContainer = document.getElementById('paginationContainer');
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
            }

        } catch (error) {
            console.error('Error filtering low stock products:', error);
            utils.showNotification('Error filtrando productos', 'error');
        }
    }

    showLoading() {
        const container = document.getElementById('productosContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando productos...</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('productosContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="inventario.loadProducts()">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }

    // Método para cargar la sección de inventario
    async loadInventorySection() {
        const employee = await db.getCurrentEmployee();
        const canManage = ['admin', 'almacen'].includes(employee.rol);

        return `
            <div class="inventario-section">
                <div class="section-header">
                    <h2><i class="fas fa-boxes"></i> Gestión de Inventario</h2>
                    <p>Administra los productos de la farmacia, stock, precios y movimientos</p>
                </div>

                <div class="inventory-controls">
                    <div class="controls-left">
                        <div class="search-box">
                            <i class="fas fa-search"></i>
                            <input type="text" id="searchProducts" 
                                   placeholder="Buscar por nombre o código...">
                        </div>
                        
                        <div class="filter-group">
                            <select id="sortProducts" class="form-control">
                                <option value="nombre_asc">Ordenar por: Nombre (A-Z)</option>
                                <option value="nombre_desc">Ordenar por: Nombre (Z-A)</option>
                                <option value="codigo_asc">Ordenar por: Código</option>
                                <option value="unidades_sueltas_asc">Ordenar por: Stock (Bajo a Alto)</option>
                                <option value="unidades_sueltas_desc">Ordenar por: Stock (Alto a Bajo)</option>
                                <option value="creado_en_desc">Ordenar por: Más reciente</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="controls-right">
                        <div class="filter-checkbox">
                            <input type="checkbox" id="filterLowStock">
                            <label for="filterLowStock">
                                <i class="fas fa-exclamation-triangle"></i>
                                Mostrar solo stock bajo
                            </label>
                        </div>
                        
                        ${canManage ? `
                            <button class="btn btn-primary" onclick="inventario.showAddProductModal()">
                                <i class="fas fa-plus"></i> Nuevo Producto
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="inventory-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-boxes"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="totalProducts">0</h3>
                            <p>Productos Totales</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon warning">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="lowStockProducts">0</h3>
                            <p>Stock Bajo</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon success">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="activeProducts">0</h3>
                            <p>Productos Activos</p>
                        </div>
                    </div>
                </div>

                <div class="products-container" id="productosContainer">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Cargando productos...</p>
                    </div>
                </div>

                <div class="pagination-container" id="paginationContainer"></div>
            </div>
        `;
    }

    // Método para inicializar cuando se carga la sección
    async initializeInventorySection() {
        await this.loadProducts();
        this.updateInventoryStats();
    }

    async updateInventoryStats() {
        try {
            // Obtener estadísticas
            const [
                { count: totalProducts },
                { count: lowStockProducts },
                { count: activeProducts }
            ] = await Promise.all([
                supabase
                    .from('productos')
                    .select('*', { count: 'exact', head: true })
                    .eq('activo', true),
                    
                supabase
                    .from('productos')
                    .select('*', { count: 'exact', head: true })
                    .lt('unidades_sueltas', 10)
                    .eq('activo', true),
                    
                supabase
                    .from('productos')
                    .select('*', { count: 'exact', head: true })
                    .eq('activo', true)
            ]);

            // Actualizar UI
            document.getElementById('totalProducts').textContent = totalProducts || 0;
            document.getElementById('lowStockProducts').textContent = lowStockProducts || 0;
            document.getElementById('activeProducts').textContent = activeProducts || 0;

        } catch (error) {
            console.error('Error updating inventory stats:', error);
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.inventario = new InventarioManager();
});