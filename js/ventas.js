// ventas.js - Punto de venta
class VentasManager {
    constructor() {
        this.carrito = [];
        this.clienteActual = null;
        this.metodoPago = 'efectivo';
        this.ventaActual = null;
        this.productos = [];
        this.searchTerm = '';
        this.currentPage = 1;
        this.itemsPerPage = 12;
        this.init();
    }

    async init() {
        await this.checkPermissions();
        this.setupEventListeners();
        this.loadProducts();
        this.updateCarritoUI();
        this.setupSearch();
    }

    async checkPermissions() {
        const employee = await db.getCurrentEmployee();
        if (!employee) {
            window.location.href = 'index.html';
            return;
        }

        const allowedRoles = ['admin', 'cajero'];
        if (!allowedRoles.includes(employee.rol)) {
            window.location.href = 'dashboard.html';
            return;
        }
    }

    async loadProducts(page = 1) {
        try {
            this.currentPage = page;
            
            let query = supabase
                .from('productos')
                .select('*')
                .eq('activo', true)
                .order('nombre', { ascending: true });

            // Aplicar búsqueda si existe
            if (this.searchTerm) {
                query = query.or(`nombre.ilike.%${this.searchTerm}%,codigo.ilike.%${this.searchTerm}%`);
            }

            // Aplicar paginación
            const from = (page - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data: productos, error } = await query;

            if (error) throw error;

            this.productos = productos || [];
            this.renderProducts();
            
        } catch (error) {
            console.error('Error loading products for sales:', error);
            this.showError('Error cargando productos');
        }
    }

    renderProducts() {
        const container = document.getElementById('productosVentaContainer');
        if (!container) return;

        if (this.productos.length === 0) {
            container.innerHTML = `
                <div class="empty-products">
                    <i class="fas fa-search"></i>
                    <h3>No se encontraron productos</h3>
                    <p>${this.searchTerm ? 'Intenta con otro término de búsqueda' : 'No hay productos disponibles'}</p>
                </div>
            `;
            return;
        }

        const productosHtml = this.productos.map(producto => {
            const tieneStockUnidades = producto.unidades_sueltas > 0;
            const tieneStockPaquetes = producto.paquetes > 0;
            const requiereReceta = producto.requiere_receta;
            
            return `
                <div class="producto-venta-card ${requiereReceta ? 'requiere-receta' : ''}" 
                     data-product-id="${producto.id}">
                    
                    ${requiereReceta ? `
                        <div class="receta-badge">
                            <i class="fas fa-prescription"></i>
                            Requiere receta
                        </div>
                    ` : ''}
                    
                    <div class="producto-header">
                        <div class="producto-codigo">${producto.codigo}</div>
                        <div class="producto-stock-indicator ${!tieneStockUnidades && !tieneStockPaquetes ? 'sin-stock' : ''}">
                            <i class="fas fa-${!tieneStockUnidades && !tieneStockPaquetes ? 'times-circle' : 'check-circle'}"></i>
                            ${!tieneStockUnidades && !tieneStockPaquetes ? 'Sin stock' : 'Disponible'}
                        </div>
                    </div>
                    
                    <div class="producto-body">
                        <h4 class="producto-nombre">${producto.nombre}</h4>
                        
                        ${producto.descripcion ? `
                            <p class="producto-descripcion">${producto.descripcion}</p>
                        ` : ''}
                        
                        <div class="producto-stock-info">
                            <div class="stock-item">
                                <i class="fas fa-box-open"></i>
                                <span>${producto.unidades_sueltas} unidades</span>
                            </div>
                            <div class="stock-item">
                                <i class="fas fa-boxes"></i>
                                <span>${producto.paquetes} paquetes</span>
                            </div>
                            <div class="stock-item">
                                <i class="fas fa-box"></i>
                                <span>${producto.unidades_por_paquete}/paq</span>
                            </div>
                        </div>
                        
                        <div class="producto-precios">
                            <div class="precio-item">
                                <span class="precio-label">Unitario:</span>
                                <span class="precio-valor">$${producto.precio_unitario.toFixed(2)}</span>
                            </div>
                            <div class="precio-item">
                                <span class="precio-label">Paquete:</span>
                                <span class="precio-valor">$${producto.precio_paquete.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="producto-footer">
                        <div class="producto-actions">
                            ${tieneStockUnidades ? `
                                <button class="btn btn-sm btn-primary" 
                                        onclick="ventas.agregarAlCarrito('${producto.id}', 'unidad', 1)"
                                        ${!tieneStockUnidades ? 'disabled' : ''}>
                                    <i class="fas fa-plus"></i> Agregar Unidad
                                </button>
                            ` : ''}
                            
                            ${tieneStockPaquetes ? `
                                <button class="btn btn-sm btn-success" 
                                        onclick="ventas.agregarAlCarrito('${producto.id}', 'paquete', 1)"
                                        ${!tieneStockPaquetes ? 'disabled' : ''}>
                                    <i class="fas fa-box"></i> Agregar Paquete
                                </button>
                            ` : ''}
                            
                            <button class="btn btn-sm btn-outline-primary" 
                                    onclick="ventas.mostrarModalCantidad('${producto.id}')">
                                <i class="fas fa-shopping-cart"></i> Personalizar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = productosHtml;
    }

    mostrarModalCantidad(productId) {
        const producto = this.productos.find(p => p.id === productId);
        if (!producto) return;

        const modalContent = `
            <div class="cantidad-modal">
                <div class="producto-info">
                    <h4>${producto.nombre}</h4>
                    <p>Código: ${producto.codigo}</p>
                </div>
                
                <form id="cantidadForm">
                    <input type="hidden" id="modalProductId" value="${productId}">
                    
                    <div class="form-group">
                        <label for="tipoVenta">
                            <i class="fas fa-shopping-cart"></i> Tipo de Venta
                        </label>
                        <select id="tipoVenta" name="tipo_venta" required>
                            <option value="">Seleccionar tipo...</option>
                            <option value="unidad" ${producto.unidades_sueltas > 0 ? '' : 'disabled'}>
                                Unidades sueltas (Disponibles: ${producto.unidades_sueltas})
                            </option>
                            <option value="paquete" ${producto.paquetes > 0 ? '' : 'disabled'}>
                                Paquetes (Disponibles: ${producto.paquetes})
                            </option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="cantidad">
                            <i class="fas fa-hashtag"></i> Cantidad
                        </label>
                        <input type="number" id="cantidad" name="cantidad" 
                               required min="1" value="1" placeholder="Ingrese cantidad">
                    </div>
                    
                    <div class="preview-info">
                        <div class="preview-item">
                            <span>Subtotal estimado:</span>
                            <span id="previewSubtotal">$0.00</span>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="utils.closeModal('cantidadModal')">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-cart-plus"></i> Agregar al Carrito
                        </button>
                    </div>
                </form>
            </div>
        `;

        const modalId = utils.showModal(`Agregar ${producto.nombre}`, modalContent, {
            id: 'cantidadModal',
            footer: ''
        });

        this.setupCantidadModal(producto);
    }

    setupCantidadModal(producto) {
        const form = document.getElementById('cantidadForm');
        const tipoSelect = document.getElementById('tipoVenta');
        const cantidadInput = document.getElementById('cantidad');
        const previewSubtotal = document.getElementById('previewSubtotal');

        const updatePreview = () => {
            const tipo = tipoSelect.value;
            const cantidad = parseInt(cantidadInput.value) || 0;
            
            if (tipo && cantidad > 0) {
                const precio = tipo === 'unidad' ? producto.precio_unitario : producto.precio_paquete;
                const subtotal = precio * cantidad;
                previewSubtotal.textContent = `$${subtotal.toFixed(2)}`;
            } else {
                previewSubtotal.textContent = '$0.00';
            }
        };

        tipoSelect.addEventListener('change', updatePreview);
        cantidadInput.addEventListener('input', updatePreview);

        // Establecer máximo según stock
        tipoSelect.addEventListener('change', () => {
            const tipo = tipoSelect.value;
            const maxStock = tipo === 'unidad' ? producto.unidades_sueltas : producto.paquetes;
            cantidadInput.max = maxStock;
            cantidadInput.value = Math.min(parseInt(cantidadInput.value) || 1, maxStock);
            updatePreview();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const tipo = tipoSelect.value;
            const cantidad = parseInt(cantidadInput.value) || 0;
            
            if (!tipo || cantidad <= 0) {
                utils.showNotification('Seleccione tipo y cantidad válidos', 'error');
                return;
            }

            this.agregarAlCarrito(producto.id, tipo, cantidad);
            utils.closeModal('cantidadModal');
        });

        // Inicializar preview
        updatePreview();
    }

    agregarAlCarrito(productId, tipo, cantidad) {
        const producto = this.productos.find(p => p.id === productId);
        if (!producto) return;

        // Verificar stock
        const stockDisponible = tipo === 'unidad' ? producto.unidades_sueltas : producto.paquetes;
        if (cantidad > stockDisponible) {
            utils.showNotification(`Stock insuficiente. Disponible: ${stockDisponible}`, 'error');
            return;
        }

        // Verificar si ya está en el carrito
        const itemIndex = this.carrito.findIndex(item => 
            item.producto_id === productId && item.tipo_venta === tipo
        );

        if (itemIndex > -1) {
            // Actualizar cantidad existente
            const nuevaCantidad = this.carrito[itemIndex].cantidad + cantidad;
            
            if (nuevaCantidad > stockDisponible) {
                utils.showNotification(`Stock insuficiente. Disponible: ${stockDisponible}`, 'error');
                return;
            }
            
            this.carrito[itemIndex].cantidad = nuevaCantidad;
            this.carrito[itemIndex].subtotal = this.calcularSubtotal(
                producto, 
                tipo, 
                nuevaCantidad
            );
        } else {
            // Agregar nuevo item
            this.carrito.push({
                producto_id: productId,
                producto_nombre: producto.nombre,
                producto_codigo: producto.codigo,
                tipo_venta: tipo,
                cantidad: cantidad,
                precio_unitario: tipo === 'unidad' ? producto.precio_unitario : producto.precio_paquete,
                subtotal: this.calcularSubtotal(producto, tipo, cantidad),
                requiere_receta: producto.requiere_receta
            });
        }

        utils.showNotification(`Producto agregado al carrito`, 'success');
        this.updateCarritoUI();
        this.updateResumen();
    }

    calcularSubtotal(producto, tipo, cantidad) {
        const precio = tipo === 'unidad' ? producto.precio_unitario : producto.precio_paquete;
        return precio * cantidad;
    }

    updateCarritoUI() {
        const container = document.getElementById('carritoItems');
        const emptyState = document.getElementById('carritoEmpty');
        const carritoContent = document.getElementById('carritoContent');
        const totalElement = document.getElementById('carritoTotal');

        if (this.carrito.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            if (carritoContent) carritoContent.classList.add('hidden');
            if (totalElement) totalElement.textContent = '$0.00';
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (carritoContent) carritoContent.classList.remove('hidden');

        // Renderizar items del carrito
        if (container) {
            const itemsHtml = this.carrito.map((item, index) => {
                const icon = item.tipo_venta === 'unidad' ? 'fa-box-open' : 'fa-box';
                const tipoLabel = item.tipo_venta === 'unidad' ? 'unidades' : 'paquetes';
                
                return `
                    <div class="carrito-item">
                        <div class="carrito-item-header">
                            <span class="item-nombre">
                                <i class="fas ${icon}"></i>
                                ${item.producto_nombre}
                            </span>
                            <button class="btn-icon btn-danger btn-sm" 
                                    onclick="ventas.eliminarDelCarrito(${index})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        
                        <div class="carrito-item-details">
                            <div class="detail-row">
                                <span>Código: ${item.producto_codigo}</span>
                                <span>${item.cantidad} ${tipoLabel}</span>
                            </div>
                            <div class="detail-row">
                                <span>Precio unitario: $${item.precio_unitario.toFixed(2)}</span>
                                <span class="item-subtotal">$${item.subtotal.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        ${item.requiere_receta ? `
                            <div class="carrito-item-warning">
                                <i class="fas fa-prescription"></i>
                                <span>Requiere verificación de receta</span>
                            </div>
                        ` : ''}
                        
                        <div class="carrito-item-actions">
                            <button class="btn-icon" onclick="ventas.modificarCantidad(${index}, -1)">
                                <i class="fas fa-minus"></i>
                            </button>
                            <input type="number" class="cantidad-input" 
                                   value="${item.cantidad}" min="1"
                                   onchange="ventas.actualizarCantidad(${index}, this.value)">
                            <button class="btn-icon" onclick="ventas.modificarCantidad(${index}, 1)">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = itemsHtml;
        }

        // Actualizar total
        this.updateResumen();
    }

    eliminarDelCarrito(index) {
        if (index >= 0 && index < this.carrito.length) {
            this.carrito.splice(index, 1);
            utils.showNotification('Producto eliminado del carrito', 'info');
            this.updateCarritoUI();
            this.updateResumen();
        }
    }

    modificarCantidad(index, delta) {
        if (index >= 0 && index < this.carrito.length) {
            const item = this.carrito[index];
            const nuevaCantidad = item.cantidad + delta;
            
            if (nuevaCantidad < 1) {
                this.eliminarDelCarrito(index);
                return;
            }

            // Verificar stock
            const producto = this.productos.find(p => p.id === item.producto_id);
            if (!producto) return;

            const stockDisponible = item.tipo_venta === 'unidad' 
                ? producto.unidades_sueltas 
                : producto.paquetes;

            if (nuevaCantidad > stockDisponible) {
                utils.showNotification(`Stock insuficiente. Disponible: ${stockDisponible}`, 'error');
                return;
            }

            item.cantidad = nuevaCantidad;
            item.subtotal = this.calcularSubtotal(producto, item.tipo_venta, nuevaCantidad);
            
            this.updateCarritoUI();
            this.updateResumen();
        }
    }

    actualizarCantidad(index, nuevaCantidad) {
        nuevaCantidad = parseInt(nuevaCantidad);
        
        if (isNaN(nuevaCantidad) || nuevaCantidad < 1) {
            this.eliminarDelCarrito(index);
            return;
        }

        this.modificarCantidad(index, nuevaCantidad - this.carrito[index].cantidad);
    }

    updateResumen() {
        const total = this.carrito.reduce((sum, item) => sum + item.subtotal, 0);
        const iva = total * 0.16; // 16% IVA (ajustar según país)
        const totalConIva = total + iva;
        
        // Actualizar elementos UI
        const subtotalElement = document.getElementById('subtotalVenta');
        const ivaElement = document.getElementById('ivaVenta');
        const totalElement = document.getElementById('totalVenta');
        const totalCarritoElement = document.getElementById('carritoTotal');
        const itemsCountElement = document.getElementById('carritoItemsCount');

        if (subtotalElement) subtotalElement.textContent = `$${total.toFixed(2)}`;
        if (ivaElement) ivaElement.textContent = `$${iva.toFixed(2)}`;
        if (totalElement) totalElement.textContent = `$${totalConIva.toFixed(2)}`;
        if (totalCarritoElement) totalCarritoElement.textContent = `$${totalConIva.toFixed(2)}`;
        
        if (itemsCountElement) {
            const totalItems = this.carrito.reduce((sum, item) => sum + item.cantidad, 0);
            itemsCountElement.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
        }
    }

    limpiarCarrito() {
        const confirmed = confirm('¿Estás seguro de que deseas vaciar el carrito?');
        if (confirmed) {
            this.carrito = [];
            this.updateCarritoUI();
            this.updateResumen();
            utils.showNotification('Carrito vaciado', 'info');
        }
    }

    async finalizarVenta() {
        if (this.carrito.length === 0) {
            utils.showNotification('El carrito está vacío', 'error');
            return;
        }

        // Verificar stock antes de procesar
        const stockValido = await this.verificarStock();
        if (!stockValido) {
            utils.showNotification('Error de stock. Revise las cantidades.', 'error');
            return;
        }

        // Mostrar modal de confirmación
        await this.mostrarConfirmacionVenta();
    }

    async verificarStock() {
        try {
            for (const item of this.carrito) {
                const { data: producto, error } = await supabase
                    .from('productos')
                    .select('unidades_sueltas, paquetes')
                    .eq('id', item.producto_id)
                    .single();

                if (error) throw error;

                const stockDisponible = item.tipo_venta === 'unidad' 
                    ? producto.unidades_sueltas 
                    : producto.paquetes;

                if (item.cantidad > stockDisponible) {
                    utils.showNotification(
                        `Stock insuficiente para ${item.producto_nombre}. Disponible: ${stockDisponible}`,
                        'error'
                    );
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Error verificando stock:', error);
            return false;
        }
    }

    async mostrarConfirmacionVenta() {
        const total = this.carrito.reduce((sum, item) => sum + item.subtotal, 0);
        const iva = total * 0.16;
        const totalConIva = total + iva;

        const itemsHtml = this.carrito.map(item => {
            const tipoLabel = item.tipo_venta === 'unidad' ? 'unidades' : 'paquetes';
            return `
                <div class="confirm-item">
                    <div class="confirm-item-header">
                        <span>${item.producto_nombre}</span>
                        <span>$${item.subtotal.toFixed(2)}</span>
                    </div>
                    <div class="confirm-item-details">
                        ${item.cantidad} ${tipoLabel} x $${item.precio_unitario.toFixed(2)}
                    </div>
                </div>
            `;
        }).join('');

        const modalContent = `
            <div class="confirm-venta-modal">
                <div class="confirm-header">
                    <h4><i class="fas fa-receipt"></i> Confirmar Venta</h4>
                    <p>Revise los detalles antes de finalizar</p>
                </div>
                
                <div class="confirm-body">
                    <div class="confirm-items">
                        ${itemsHtml}
                    </div>
                    
                    <div class="confirm-totals">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <span>$${total.toFixed(2)}</span>
                        </div>
                        <div class="total-row">
                            <span>IVA (16%):</span>
                            <span>$${iva.toFixed(2)}</span>
                        </div>
                        <div class="total-row total">
                            <span>Total:</span>
                            <span>$${totalConIva.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div class="confirm-cliente">
                        <div class="form-group">
                            <label for="clienteNombre">
                                <i class="fas fa-user"></i> Nombre del Cliente (opcional)
                            </label>
                            <input type="text" id="clienteNombre" 
                                   placeholder="Nombre del cliente">
                        </div>
                        
                        <div class="form-group">
                            <label for="clienteDNI">
                                <i class="fas fa-id-card"></i> DNI/RUC (opcional)
                            </label>
                            <input type="text" id="clienteDNI" 
                                   placeholder="DNI o RUC del cliente">
                        </div>
                    </div>
                    
                    <div class="confirm-pago">
                        <div class="form-group">
                            <label for="metodoPago">
                                <i class="fas fa-credit-card"></i> Método de Pago *
                            </label>
                            <select id="metodoPago" required>
                                <option value="efectivo">Efectivo</option>
                                <option value="tarjeta_debito">Tarjeta de Débito</option>
                                <option value="tarjeta_credito">Tarjeta de Crédito</option>
                                <option value="transferencia">Transferencia</option>
                                <option value="yape">Yape/Plin</option>
                            </select>
                        </div>
                        
                        <div class="form-group" id="efectivoGroup" style="display: none;">
                            <label for="montoRecibido">
                                <i class="fas fa-money-bill-wave"></i> Monto Recibido *
                            </label>
                            <input type="number" id="montoRecibido" 
                                   min="${totalConIva}" step="0.01" 
                                   placeholder="0.00">
                        </div>
                        
                        <div id="cambioInfo" class="cambio-info" style="display: none;">
                            <div class="cambio-row">
                                <span>Cambio:</span>
                                <span id="cambioMonto">$0.00</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="confirm-requiere-receta" id="requiereRecetaSection" 
                         style="${this.carrito.some(item => item.requiere_receta) ? '' : 'display: none;'}">
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle"></i>
                            <div>
                                <strong>¡Atención!</strong>
                                <p>Esta venta contiene productos que requieren receta médica. 
                                Verifique que el cliente presente la receta correspondiente.</p>
                            </div>
                        </div>
                        
                        <div class="checkbox-group">
                            <input type="checkbox" id="confirmReceta">
                            <label for="confirmReceta" class="checkbox-label">
                                Confirmo que se ha verificado la receta médica
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="confirm-footer">
                    <button type="button" class="btn btn-secondary" 
                            onclick="utils.closeModal('confirmVentaModal')">
                        Cancelar
                    </button>
                    <button type="button" class="btn btn-success" 
                            onclick="ventas.procesarVenta()" id="procesarVentaBtn">
                        <i class="fas fa-check-circle"></i> Procesar Venta
                    </button>
                </div>
            </div>
        `;

        const modalId = utils.showModal('Confirmar Venta', modalContent, {
            id: 'confirmVentaModal',
            footer: ''
        });

        this.setupConfirmacionVenta(totalConIva);
    }

    setupConfirmacionVenta(totalConIva) {
        const metodoPagoSelect = document.getElementById('metodoPago');
        const efectivoGroup = document.getElementById('efectivoGroup');
        const cambioInfo = document.getElementById('cambioInfo');
        const montoRecibidoInput = document.getElementById('montoRecibido');
        const cambioMonto = document.getElementById('cambioMonto');
        const requiereRecetaSection = document.getElementById('requiereRecetaSection');
        const confirmRecetaCheckbox = document.getElementById('confirmReceta');
        const procesarBtn = document.getElementById('procesarVentaBtn');

        // Manejar cambio de método de pago
        metodoPagoSelect.addEventListener('change', () => {
            const metodo = metodoPagoSelect.value;
            
            if (metodo === 'efectivo') {
                efectivoGroup.style.display = 'block';
                cambioInfo.style.display = 'block';
                montoRecibidoInput.value = '';
                montoRecibidoInput.focus();
            } else {
                efectivoGroup.style.display = 'none';
                cambioInfo.style.display = 'none';
            }
        });

        // Calcular cambio
        montoRecibidoInput?.addEventListener('input', () => {
            const montoRecibido = parseFloat(montoRecibidoInput.value) || 0;
            const cambio = montoRecibido - totalConIva;
            
            if (cambio >= 0) {
                cambioMonto.textContent = `$${cambio.toFixed(2)}`;
                procesarBtn.disabled = false;
            } else {
                cambioMonto.textContent = 'Insuficiente';
                procesarBtn.disabled = true;
            }
        });

        // Validar receta si es necesario
        if (requiereRecetaSection.style.display !== 'none') {
            confirmRecetaCheckbox.addEventListener('change', () => {
                procesarBtn.disabled = !confirmRecetaCheckbox.checked;
            });
            procesarBtn.disabled = true;
        }

        // Inicializar
        metodoPagoSelect.dispatchEvent(new Event('change'));
    }

    async procesarVenta() {
        try {
            const employee = await db.getCurrentEmployee();
            const metodoPago = document.getElementById('metodoPago').value;
            const clienteNombre = document.getElementById('clienteNombre')?.value || null;
            const clienteDNI = document.getElementById('clienteDNI')?.value || null;
            
            // Calcular totales
            const subtotal = this.carrito.reduce((sum, item) => sum + item.subtotal, 0);
            const iva = subtotal * 0.16;
            const total = subtotal + iva;
            
            // Crear la venta
            const ventaData = {
                total: total,
                estado: 'completada',
                vendedor_id: employee.id,
                cliente_nombre: clienteNombre,
                cliente_dni: clienteDNI,
                requiere_receta: this.carrito.some(item => item.requiere_receta)
            };

            const { data: venta, error: ventaError } = await supabase
                .from('ventas')
                .insert([ventaData])
                .select()
                .single();

            if (ventaError) throw ventaError;

            // Crear detalles de venta
            const detallesVenta = this.carrito.map(item => ({
                venta_id: venta.id,
                producto_id: item.producto_id,
                tipo_venta: item.tipo_venta,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unitario,
                subtotal: item.subtotal
            }));

            const { error: detallesError } = await supabase
                .from('detalle_ventas')
                .insert(detallesVenta);

            if (detallesError) throw detallesError;

            // Registrar pago
            await this.registrarPago(venta.id, total, metodoPago);

            // Limpiar carrito
            this.carrito = [];
            this.updateCarritoUI();
            this.updateResumen();

            // Mostrar recibo
            await this.mostrarRecibo(venta);

            utils.showNotification('Venta procesada exitosamente', 'success');
            utils.closeModal('confirmVentaModal');

            // Recargar productos para actualizar stock
            await this.loadProducts(this.currentPage);

        } catch (error) {
            console.error('Error procesando venta:', error);
            utils.showNotification('Error procesando venta', 'error');
        }
    }

    async registrarPago(ventaId, monto, metodo) {
        try {
            const pagoData = {
                venta_id: ventaId,
                monto: monto,
                metodo_pago: metodo,
                estado: 'completado'
            };

            const { error } = await supabase
                .from('pagos')
                .insert([pagoData]);

            if (error) throw error;

        } catch (error) {
            console.error('Error registrando pago:', error);
            throw error;
        }
    }

    async mostrarRecibo(venta) {
        const { data: detalles, error } = await supabase
            .from('detalle_ventas')
            .select(`
                *,
                productos:productos!detalle_ventas_producto_id_fkey(nombre, codigo)
            `)
            .eq('venta_id', venta.id);

        if (error) {
            console.error('Error cargando detalles del recibo:', error);
            return;
        }

        const reciboContent = `
            <div class="recibo">
                <div class="recibo-header">
                    <h4><i class="fas fa-receipt"></i> Recibo de Venta</h4>
                    <div class="recibo-info">
                        <div class="info-row">
                            <span>Número de Venta:</span>
                            <strong>${venta.codigo_venta || venta.id.substring(0, 8)}</strong>
                        </div>
                        <div class="info-row">
                            <span>Fecha:</span>
                            <span>${utils.formatDate(venta.creado_en, 'full')}</span>
                        </div>
                        <div class="info-row">
                            <span>Vendedor:</span>
                            <span>${venta.vendedor_id}</span>
                        </div>
                    </div>
                </div>
                
                <div class="recibo-body">
                    <div class="recibo-items">
                        <table class="recibo-table">
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Cantidad</th>
                                    <th>Precio</th>
                                    <th>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detalles.map(detalle => `
                                    <tr>
                                        <td>${detalle.productos.nombre}</td>
                                        <td>${detalle.cantidad} ${detalle.tipo_venta}</td>
                                        <td>$${detalle.precio_unitario.toFixed(2)}</td>
                                        <td>$${detalle.subtotal.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="recibo-totals">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <span>$${venta.total / 1.16}</span>
                        </div>
                        <div class="total-row">
                            <span>IVA (16%):</span>
                            <span>$${venta.total * 0.16}</span>
                        </div>
                        <div class="total-row final">
                            <span>Total:</span>
                            <span>$${venta.total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="recibo-footer">
                    <div class="recibo-message">
                        <i class="fas fa-info-circle"></i>
                        <span>¡Gracias por su compra! Vuelva pronto.</span>
                    </div>
                    <div class="recibo-actions">
                        <button class="btn btn-primary" onclick="ventas.imprimirRecibo(this)">
                            <i class="fas fa-print"></i> Imprimir Recibo
                        </button>
                        <button class="btn btn-secondary" onclick="utils.closeModal('reciboModal')">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modalId = utils.showModal('Recibo de Venta', reciboContent, {
            id: 'reciboModal',
            footer: ''
        });
    }

    imprimirRecibo(btn) {
        const reciboContent = document.querySelector('.recibo');
        if (!reciboContent) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Recibo de Venta</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .recibo { width: 80mm; }
                    .recibo-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
                    .recibo-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    .recibo-table th, .recibo-table td { padding: 5px; text-align: left; }
                    .recibo-table th { border-bottom: 1px solid #000; }
                    .recibo-totals { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; }
                    .total-row { display: flex; justify-content: space-between; }
                    .total-row.final { font-weight: bold; font-size: 1.2em; }
                    @media print {
                        body { margin: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                ${reciboContent.outerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    setupSearch() {
        const searchInput = document.getElementById('searchProductosVenta');
        if (!searchInput) return;

        const searchHandler = utils.debounce((e) => {
            this.searchTerm = e.target.value.trim();
            this.loadProducts(1);
        }, 300);

        searchInput.addEventListener('input', searchHandler);
    }

    showError(message) {
        const container = document.getElementById('productosVentaContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="ventas.loadProducts()">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }

    // Método para cargar la sección de ventas
    async loadSalesSection() {
        const employee = await db.getCurrentEmployee();
        const canSell = ['admin', 'cajero'].includes(employee.rol);

        if (!canSell) {
            return `
                <div class="access-denied">
                    <i class="fas fa-ban"></i>
                    <h3>Acceso Denegado</h3>
                    <p>No tienes permisos para acceder al punto de venta.</p>
                    <button class="btn btn-primary" onclick="dashboard.loadSection('inicio')">
                        Volver al Inicio
                    </button>
                </div>
            `;
        }

        return `
            <div class="ventas-section">
                <div class="section-header">
                    <h2><i class="fas fa-cash-register"></i> Punto de Venta</h2>
                    <p>Procesa ventas rápidas y eficientes</p>
                </div>

                <div class="ventas-layout">
                    <!-- Panel izquierdo: Productos -->
                    <div class="ventas-left">
                        <div class="productos-header">
                            <div class="search-box">
                                <i class="fas fa-search"></i>
                                <input type="text" id="searchProductosVenta" 
                                       placeholder="Buscar productos...">
                            </div>
                            
                            <div class="cajero-info">
                                <div class="cajero-name">
                                    <i class="fas fa-user-tie"></i>
                                    <span>${employee.nombre}</span>
                                </div>
                                <div class="cajero-time">
                                    <i class="fas fa-clock"></i>
                                    <span id="currentSaleTime">${utils.formatDate(new Date(), 'time')}</span>
                                </div>
                            </div>
                        </div>

                        <div class="productos-grid" id="productosVentaContainer">
                            <div class="loading-products">
                                <i class="fas fa-spinner fa-spin"></i>
                                <p>Cargando productos...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Panel derecho: Carrito -->
                    <div class="ventas-right">
                        <div class="carrito-header">
                            <h3><i class="fas fa-shopping-cart"></i> Carrito de Venta</h3>
                            <div class="carrito-info">
                                <span id="carritoItemsCount">0 items</span>
                                <span id="carritoTotal">$0.00</span>
                            </div>
                        </div>

                        <div class="carrito-body">
                            <div id="carritoEmpty" class="carrito-empty">
                                <i class="fas fa-shopping-cart"></i>
                                <h4>Carrito vacío</h4>
                                <p>Agrega productos desde el panel izquierdo</p>
                            </div>

                            <div id="carritoContent" class="carrito-content hidden">
                                <div class="carrito-items" id="carritoItems">
                                    <!-- Items del carrito se cargan aquí -->
                                </div>
                                
                                <div class="carrito-resumen">
                                    <h4>Resumen de Venta</h4>
                                    <div class="resumen-row">
                                        <span>Subtotal:</span>
                                        <span id="subtotalVenta">$0.00</span>
                                    </div>
                                    <div class="resumen-row">
                                        <span>IVA (16%):</span>
                                        <span id="ivaVenta">$0.00</span>
                                    </div>
                                    <div class="resumen-row total">
                                        <span>Total:</span>
                                        <span id="totalVenta">$0.00</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="carrito-footer">
                            <button class="btn btn-danger" onclick="ventas.limpiarCarrito()" 
                                    ${this.carrito.length === 0 ? 'disabled' : ''}>
                                <i class="fas fa-trash"></i> Vaciar Carrito
                            </button>
                            
                            <button class="btn btn-success" onclick="ventas.finalizarVenta()"
                                    ${this.carrito.length === 0 ? 'disabled' : ''}>
                                <i class="fas fa-check-circle"></i> Finalizar Venta
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Método para inicializar cuando se carga la sección
    async initializeSalesSection() {
        await this.loadProducts();
        
        // Actualizar hora actual
        setInterval(() => {
            const timeElement = document.getElementById('currentSaleTime');
            if (timeElement) {
                timeElement.textContent = utils.formatDate(new Date(), 'time');
            }
        }, 60000);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.ventas = new VentasManager();
});