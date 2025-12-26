// historial.js - Historial de auditoría y reportes
class HistorialManager {
    constructor() {
        this.historial = [];
        this.reportes = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.searchTerm = '';
        this.filterTabla = '';
        this.filterAccion = '';
        this.filterFechaDesde = '';
        this.filterFechaHasta = '';
        this.sortField = 'creado_en';
        this.sortOrder = 'desc';
        this.init();
    }

    async init() {
        await this.checkPermissions();
        this.setupEventListeners();
        this.loadHistorial();
        this.setupFilters();
        this.setupDateRange();
    }

    async checkPermissions() {
        const employee = await db.getCurrentEmployee();
        if (!employee) {
            window.location.href = 'index.html';
            return;
        }

        // Solo administradores y supervisores pueden ver historial
        const allowedRoles = ['admin', 'supervisor'];
        if (!allowedRoles.includes(employee.rol)) {
            window.location.href = 'dashboard.html';
            return;
        }
    }

    async loadHistorial(page = 1) {
        try {
            this.currentPage = page;
            
            // Mostrar loading
            this.showLoading();
            
            let query = supabase
                .from('historial_auditoria')
                .select(`
                    *,
                    empleados:empleados!historial_auditoria_empleado_id_fkey (
                        nombre,
                        rol
                    )
                `)
                .order(this.sortField, { ascending: this.sortOrder === 'asc' });

            // Aplicar filtros
            if (this.filterTabla) {
                query = query.eq('tabla_afectada', this.filterTabla);
            }

            if (this.filterAccion) {
                query = query.eq('accion', this.filterAccion);
            }

            if (this.filterFechaDesde) {
                query = query.gte('creado_en', `${this.filterFechaDesde}T00:00:00`);
            }

            if (this.filterFechaHasta) {
                query = query.lte('creado_en', `${this.filterFechaHasta}T23:59:59`);
            }

            // Aplicar búsqueda si existe
            if (this.searchTerm) {
                query = query.or(`tabla_afectada.ilike.%${this.searchTerm}%,empleados.nombre.ilike.%${this.searchTerm}%`);
            }

            // Aplicar paginación
            const from = (page - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data: historial, error, count } = await query;

            if (error) throw error;

            this.historial = historial || [];
            
            // Obtener total para paginación
            const { count: totalCount } = await supabase
                .from('historial_auditoria')
                .select('*', { count: 'exact', head: true });

            this.totalHistorial = totalCount || 0;
            
            this.renderHistorial();
            this.renderPagination();
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading historial:', error);
            this.showError('Error cargando historial');
        }
    }

    renderHistorial() {
        const container = document.getElementById('historialContainer');
        if (!container) return;

        if (this.historial.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <h3>No hay registros de historial</h3>
                    <p>${this.searchTerm || this.filterTabla || this.filterFechaDesde ? 
                        'No se encontraron registros con los filtros aplicados' : 
                        'El historial aparecerá aquí cuando se realicen acciones en el sistema'}</p>
                </div>
            `;
            return;
        }

        const historialHtml = this.historial.map(registro => {
            const fecha = utils.formatDate(registro.creado_en, 'full');
            const accionClass = this.getAccionClass(registro.accion);
            const icon = this.getAccionIcon(registro.accion);
            
            return `
                <div class="historial-card" data-registro-id="${registro.id}">
                    <div class="historial-header">
                        <div class="historial-accion ${accionClass}">
                            <i class="fas ${icon}"></i>
                            <span>${registro.accion}</span>
                        </div>
                        <div class="historial-tabla">
                            <i class="fas fa-table"></i>
                            <span>${registro.tabla_afectada}</span>
                        </div>
                        <div class="historial-fecha">
                            <i class="fas fa-clock"></i>
                            <span>${fecha}</span>
                        </div>
                    </div>
                    
                    <div class="historial-body">
                        <div class="historial-usuario">
                            <div class="usuario-info">
                                <div class="usuario-avatar-small">
                                    ${registro.empleados?.nombre?.charAt(0) || 'S'}
                                </div>
                                <div class="usuario-details">
                                    <div class="usuario-nombre">${registro.empleados?.nombre || 'Sistema'}</div>
                                    <div class="usuario-rol">${registro.empleados?.rol || 'Sistema'}</div>
                                </div>
                            </div>
                            <div class="usuario-ip">
                                <i class="fas fa-network-wired"></i>
                                <span>${registro.ip_address || 'N/A'}</span>
                            </div>
                        </div>
                        
                        <div class="historial-datos">
                            ${registro.datos_anteriores ? `
                                <div class="datos-section">
                                    <h6><i class="fas fa-arrow-left"></i> Datos Anteriores</h6>
                                    <div class="datos-content">
                                        ${this.renderDatosJson(registro.datos_anteriores)}
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${registro.datos_nuevos ? `
                                <div class="datos-section">
                                    <h6><i class="fas fa-arrow-right"></i> Datos Nuevos</h6>
                                    <div class="datos-content">
                                        ${this.renderDatosJson(registro.datos_nuevos)}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                        
                        ${registro.user_agent ? `
                            <div class="historial-user-agent">
                                <i class="fas fa-desktop"></i>
                                <span class="user-agent-text">${registro.user_agent}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="historial-footer">
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="historial.showRegistroDetalle('${registro.id}')">
                            <i class="fas fa-search"></i> Ver Detalles
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" 
                                onclick="historial.exportarRegistro('${registro.id}')">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = historialHtml;
    }

    renderDatosJson(datos) {
        if (!datos) return '<span class="text-muted">Sin datos</span>';
        
        try {
            const parsed = typeof datos === 'string' ? JSON.parse(datos) : datos;
            
            // Si es un objeto simple, mostrar como lista
            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                const items = Object.entries(parsed).map(([key, value]) => {
                    const formattedValue = typeof value === 'object' ? 
                        JSON.stringify(value, null, 2) : 
                        String(value);
                    
                    return `
                        <div class="datos-item">
                            <span class="datos-key">${key}:</span>
                            <span class="datos-value">${formattedValue}</span>
                        </div>
                    `;
                }).join('');
                
                return items;
            }
            
            // Si es un array o valor simple
            return `<pre class="datos-json">${JSON.stringify(parsed, null, 2)}</pre>`;
            
        } catch (error) {
            return `<span class="text-danger">Error parsing data: ${error.message}</span>`;
        }
    }

    getAccionClass(accion) {
        const classes = {
            'INSERT': 'success',
            'UPDATE': 'warning',
            'DELETE': 'danger',
            'LOGIN': 'info',
            'LOGOUT': 'secondary'
        };
        return classes[accion] || 'secondary';
    }

    getAccionIcon(accion) {
        const icons = {
            'INSERT': 'fa-plus-circle',
            'UPDATE': 'fa-edit',
            'DELETE': 'fa-trash',
            'LOGIN': 'fa-sign-in-alt',
            'LOGOUT': 'fa-sign-out-alt'
        };
        return icons[accion] || 'fa-history';
    }

    renderPagination() {
        const paginationContainer = document.getElementById('paginationContainer');
        if (!paginationContainer) return;

        const totalPages = Math.ceil(this.totalHistorial / this.itemsPerPage);
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHtml = `
            <div class="pagination">
                <button class="page-btn ${this.currentPage === 1 ? 'disabled' : ''}" 
                        onclick="historial.loadHistorial(${this.currentPage - 1})" 
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
                <button class="page-btn" onclick="historial.loadHistorial(1)">1</button>
                ${startPage > 2 ? '<span class="page-dots">...</span>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="page-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="historial.loadHistorial(${i})">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            paginationHtml += `
                ${endPage < totalPages - 1 ? '<span class="page-dots">...</span>' : ''}
                <button class="page-btn" onclick="historial.loadHistorial(${totalPages})">
                    ${totalPages}
                </button>
            `;
        }

        paginationHtml += `
                <button class="page-btn ${this.currentPage === totalPages ? 'disabled' : ''}" 
                        onclick="historial.loadHistorial(${this.currentPage + 1})" 
                        ${this.currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="pagination-info">
                Mostrando ${((this.currentPage - 1) * this.itemsPerPage) + 1} - 
                ${Math.min(this.currentPage * this.itemsPerPage, this.totalHistorial)} 
                de ${this.totalHistorial} registros
            </div>
        `;

        paginationContainer.innerHTML = paginationHtml;
    }

    async showRegistroDetalle(registroId) {
        try {
            const { data: registro, error } = await supabase
                .from('historial_auditoria')
                .select(`
                    *,
                    empleados:empleados!historial_auditoria_empleado_id_fkey (
                        nombre,
                        email,
                        rol,
                        creado_en
                    )
                `)
                .eq('id', registroId)
                .single();

            if (error) throw error;

            const modalContent = `
                <div class="registro-detalle-modal">
                    <div class="detalle-header">
                        <div class="detalle-title">
                            <h4>Detalles del Registro de Auditoría</h4>
                            <div class="detalle-id">ID: ${registro.id}</div>
                        </div>
                        
                        <div class="detalle-badges">
                            <span class="badge badge-${this.getAccionClass(registro.accion)}">
                                <i class="fas ${this.getAccionIcon(registro.accion)}"></i>
                                ${registro.accion}
                            </span>
                            <span class="badge badge-info">
                                <i class="fas fa-table"></i>
                                ${registro.tabla_afectada}
                            </span>
                            <span class="badge badge-secondary">
                                <i class="fas fa-calendar"></i>
                                ${utils.formatDate(registro.creado_en, 'full')}
                            </span>
                        </div>
                    </div>
                    
                    <div class="detalle-content">
                        <div class="detalle-section">
                            <h5><i class="fas fa-user"></i> Información del Usuario</h5>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Nombre:</span>
                                    <span class="info-value">${registro.empleados?.nombre || 'Sistema'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Rol:</span>
                                    <span class="info-value">${registro.empleados?.rol || 'Sistema'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Email:</span>
                                    <span class="info-value">${registro.empleados?.email || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">IP Address:</span>
                                    <span class="info-value">${registro.ip_address || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">User Agent:</span>
                                    <span class="info-value">${registro.user_agent || 'N/A'}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Fecha Registro:</span>
                                    <span class="info-value">${utils.formatDate(registro.creado_en, 'full')}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${registro.datos_anteriores ? `
                            <div class="detalle-section">
                                <h5><i class="fas fa-arrow-left"></i> Datos Anteriores</h5>
                                <div class="json-viewer">
                                    <pre id="datosAnteriores">${JSON.stringify(registro.datos_anteriores, null, 2)}</pre>
                                </div>
                                <button class="btn btn-sm btn-outline-secondary mt-2" 
                                        onclick="historial.copyToClipboard('datosAnteriores')">
                                    <i class="fas fa-copy"></i> Copiar JSON
                                </button>
                            </div>
                        ` : ''}
                        
                        ${registro.datos_nuevos ? `
                            <div class="detalle-section">
                                <h5><i class="fas fa-arrow-right"></i> Datos Nuevos</h5>
                                <div class="json-viewer">
                                    <pre id="datosNuevos">${JSON.stringify(registro.datos_nuevos, null, 2)}</pre>
                                </div>
                                <button class="btn btn-sm btn-outline-secondary mt-2" 
                                        onclick="historial.copyToClipboard('datosNuevos')">
                                    <i class="fas fa-copy"></i> Copiar JSON
                                </button>
                            </div>
                        ` : ''}
                        
                        <div class="detalle-section">
                            <h5><i class="fas fa-code"></i> Información Técnica</h5>
                            <div class="info-grid">
                                <div class="info-item">
                                    <span class="info-label">Registro ID:</span>
                                    <span class="info-value monospace">${registro.id}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Tabla Afectada:</span>
                                    <span class="info-value">${registro.tabla_afectada}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Acción:</span>
                                    <span class="info-value">${registro.accion}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Timestamp:</span>
                                    <span class="info-value">${registro.creado_en}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="detalle-footer">
                        <button type="button" class="btn btn-secondary" 
                                onclick="utils.closeModal('registroDetalleModal')">
                            Cerrar
                        </button>
                        <button type="button" class="btn btn-primary" 
                                onclick="historial.exportarRegistro('${registro.id}')">
                            <i class="fas fa-download"></i> Exportar Registro
                        </button>
                    </div>
                </div>
            `;

            const modalId = utils.showModal('Detalles de Auditoría', modalContent, {
                id: 'registroDetalleModal',
                footer: ''
            });

        } catch (error) {
            console.error('Error loading registro details:', error);
            utils.showNotification('Error cargando detalles del registro', 'error');
        }
    }

    copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            navigator.clipboard.writeText(element.textContent)
                .then(() => {
                    utils.showNotification('JSON copiado al portapapeles', 'success');
                })
                .catch(err => {
                    console.error('Error copying to clipboard:', err);
                    utils.showNotification('Error copiando JSON', 'error');
                });
        }
    }

    async exportarRegistro(registroId) {
        try {
            const { data: registro, error } = await supabase
                .from('historial_auditoria')
                .select(`
                    *,
                    empleados:empleados!historial_auditoria_empleado_id_fkey (
                        nombre,
                        email,
                        rol
                    )
                `)
                .eq('id', registroId)
                .single();

            if (error) throw error;

            const exportData = {
                metadata: {
                    export_date: new Date().toISOString(),
                    export_type: 'single_record',
                    system: 'FarmaciaSystem'
                },
                record: registro
            };

            const filename = `auditoria_${registroId}_${Date.now()}.json`;
            utils.exportToJSON(exportData, filename);

        } catch (error) {
            console.error('Error exporting registro:', error);
            utils.showNotification('Error exportando registro', 'error');
        }
    }

    async exportarHistorialCompleto() {
        try {
            const confirmed = await utils.showConfirm(
                'Exportar Historial Completo',
                '¿Estás seguro de que deseas exportar todo el historial de auditoría? Esta operación puede tomar varios minutos dependiendo del tamaño de los datos.',
                {
                    okText: 'Exportar',
                    cancelText: 'Cancelar'
                }
            );

            if (!confirmed) return;

            // Mostrar loading
            utils.showNotification('Exportando historial, por favor espere...', 'info');

            // Obtener todo el historial (sin paginación)
            const { data: historial, error } = await supabase
                .from('historial_auditoria')
                .select(`
                    *,
                    empleados:empleados!historial_auditoria_empleado_id_fkey (
                        nombre,
                        email,
                        rol
                    )
                `)
                .order('creado_en', { ascending: false });

            if (error) throw error;

            const exportData = {
                metadata: {
                    export_date: new Date().toISOString(),
                    export_type: 'full_history',
                    system: 'FarmaciaSystem',
                    total_records: historial.length,
                    filters_applied: {
                        search: this.searchTerm,
                        tabla: this.filterTabla,
                        accion: this.filterAccion,
                        fecha_desde: this.filterFechaDesde,
                        fecha_hasta: this.filterFechaHasta
                    }
                },
                records: historial
            };

            const filename = `auditoria_completa_${Date.now()}.json`;
            utils.exportToJSON(exportData, filename);

            utils.showNotification('Historial exportado exitosamente', 'success');

        } catch (error) {
            console.error('Error exporting complete history:', error);
            utils.showNotification('Error exportando historial completo', 'error');
        }
    }

    setupFilters() {
        // Filtro por tabla
        const tablaFilter = document.getElementById('filterTabla');
        if (tablaFilter) {
            tablaFilter.addEventListener('change', (e) => {
                this.filterTabla = e.target.value;
                this.loadHistorial(1);
            });
        }

        // Filtro por acción
        const accionFilter = document.getElementById('filterAccion');
        if (accionFilter) {
            accionFilter.addEventListener('change', (e) => {
                this.filterAccion = e.target.value;
                this.loadHistorial(1);
            });
        }

        // Búsqueda
        const searchInput = document.getElementById('searchHistorial');
        if (searchInput) {
            const searchHandler = utils.debounce((e) => {
                this.searchTerm = e.target.value.trim();
                this.loadHistorial(1);
            }, 300);

            searchInput.addEventListener('input', searchHandler);
        }

        // Ordenamiento
        const sortSelect = document.getElementById('sortHistorial');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                const [field, order] = e.target.value.split('_');
                this.sortField = field;
                this.sortOrder = order;
                this.loadHistorial(1);
            });
        }

        // Botón limpiar filtros
        const clearFiltersBtn = document.getElementById('clearFilters');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                this.clearFilters();
            });
        }
    }

    setupDateRange() {
        const fechaDesde = document.getElementById('filterFechaDesde');
        const fechaHasta = document.getElementById('filterFechaHasta');
        const aplicarFechaBtn = document.getElementById('aplicarFechaFilter');

        if (fechaDesde && fechaHasta && aplicarFechaBtn) {
            // Establecer valores por defecto (últimos 30 días)
            const hoy = new Date();
            const hace30Dias = new Date();
            hace30Dias.setDate(hoy.getDate() - 30);

            fechaDesde.value = hace30Dias.toISOString().split('T')[0];
            fechaHasta.value = hoy.toISOString().split('T')[0];

            this.filterFechaDesde = fechaDesde.value;
            this.filterFechaHasta = fechaHasta.value;

            aplicarFechaBtn.addEventListener('click', () => {
                this.filterFechaDesde = fechaDesde.value;
                this.filterFechaHasta = fechaHasta.value;
                this.loadHistorial(1);
            });
        }
    }

    clearFilters() {
        this.searchTerm = '';
        this.filterTabla = '';
        this.filterAccion = '';
        this.filterFechaDesde = '';
        this.filterFechaHasta = '';
        this.sortField = 'creado_en';
        this.sortOrder = 'desc';

        // Resetear inputs
        const searchInput = document.getElementById('searchHistorial');
        const tablaFilter = document.getElementById('filterTabla');
        const accionFilter = document.getElementById('filterAccion');
        const fechaDesde = document.getElementById('filterFechaDesde');
        const fechaHasta = document.getElementById('filterFechaHasta');
        const sortSelect = document.getElementById('sortHistorial');

        if (searchInput) searchInput.value = '';
        if (tablaFilter) tablaFilter.value = '';
        if (accionFilter) accionFilter.value = '';
        if (fechaDesde) fechaDesde.value = '';
        if (fechaHasta) fechaHasta.value = '';
        if (sortSelect) sortSelect.value = 'creado_en_desc';

        this.loadHistorial(1);
        utils.showNotification('Filtros limpiados', 'info');
    }

    showLoading() {
        const container = document.getElementById('historialContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando historial...</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('historialContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="historial.loadHistorial()">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }

    updateStats() {
        // Calcular estadísticas
        const totalRegistros = this.totalHistorial;
        const hoy = new Date().toISOString().split('T')[0];
        const registrosHoy = this.historial.filter(r => 
            r.creado_en.startsWith(hoy)
        ).length;

        const accionesCount = {
            INSERT: 0,
            UPDATE: 0,
            DELETE: 0,
            LOGIN: 0,
            LOGOUT: 0
        };

        this.historial.forEach(r => {
            if (accionesCount[r.accion] !== undefined) {
                accionesCount[r.accion]++;
            }
        });

        // Actualizar UI
        const totalElement = document.getElementById('totalRegistros');
        const hoyElement = document.getElementById('registrosHoy');
        const insertElement = document.getElementById('accionesInsert');
        const updateElement = document.getElementById('accionesUpdate');
        const deleteElement = document.getElementById('accionesDelete');

        if (totalElement) totalElement.textContent = totalRegistros;
        if (hoyElement) hoyElement.textContent = registrosHoy;
        if (insertElement) insertElement.textContent = accionesCount.INSERT;
        if (updateElement) updateElement.textContent = accionesCount.UPDATE;
        if (deleteElement) deleteElement.textContent = accionesCount.DELETE;
    }

    async generarReporte() {
        try {
            const confirmed = await utils.showConfirm(
                'Generar Reporte de Auditoría',
                '¿Deseas generar un reporte detallado de auditoría para el período seleccionado?',
                {
                    okText: 'Generar Reporte',
                    cancelText: 'Cancelar'
                }
            );

            if (!confirmed) return;

            utils.showNotification('Generando reporte, por favor espere...', 'info');

            // Obtener datos para el reporte
            const reporteData = await this.obtenerDatosReporte();
            
            // Generar HTML del reporte
            const reporteHtml = this.generarHtmlReporte(reporteData);
            
            // Mostrar reporte en modal
            this.mostrarReporteModal(reporteHtml, reporteData);

        } catch (error) {
            console.error('Error generating report:', error);
            utils.showNotification('Error generando reporte', 'error');
        }
    }

    async obtenerDatosReporte() {
        // Obtener datos para el período seleccionado
        let query = supabase
            .from('historial_auditoria')
            .select(`
                *,
                empleados:empleados!historial_auditoria_empleado_id_fkey (
                    nombre,
                    rol
                )
            `)
            .order('creado_en', { ascending: false });

        if (this.filterFechaDesde) {
            query = query.gte('creado_en', `${this.filterFechaDesde}T00:00:00`);
        }

        if (this.filterFechaHasta) {
            query = query.lte('creado_en', `${this.filterFechaHasta}T23:59:59`);
        }

        const { data: historial, error } = await query;

        if (error) throw error;

        // Calcular estadísticas
        const estadisticas = {
            total_registros: historial.length,
            por_tabla: {},
            por_accion: {},
            por_usuario: {},
            por_dia: {}
        };

        historial.forEach(registro => {
            // Por tabla
            estadisticas.por_tabla[registro.tabla_afectada] = 
                (estadisticas.por_tabla[registro.tabla_afectada] || 0) + 1;

            // Por acción
            estadisticas.por_accion[registro.accion] = 
                (estadisticas.por_accion[registro.accion] || 0) + 1;

            // Por usuario
            const usuario = registro.empleados?.nombre || 'Sistema';
            estadisticas.por_usuario[usuario] = 
                (estadisticas.por_usuario[usuario] || 0) + 1;

            // Por día
            const fecha = registro.creado_en.split('T')[0];
            estadisticas.por_dia[fecha] = (estadisticas.por_dia[fecha] || 0) + 1;
        });

        return {
            metadata: {
                fecha_generacion: new Date().toISOString(),
                periodo: {
                    desde: this.filterFechaDesde || 'Inicio',
                    hasta: this.filterFechaHasta || 'Actual'
                },
                filtros_aplicados: {
                    tabla: this.filterTabla,
                    accion: this.filterAccion,
                    busqueda: this.searchTerm
                }
            },
            estadisticas,
            registros: historial.slice(0, 100) // Limitar a 100 registros para el reporte
        };
    }

    generarHtmlReporte(reporteData) {
        const { metadata, estadisticas, registros } = reporteData;

        return `
            <div class="reporte-auditoria">
                <div class="reporte-header">
                    <h4>Reporte de Auditoría - FarmaciaSystem</h4>
                    <div class="reporte-metadata">
                        <div class="metadata-item">
                            <strong>Fecha de generación:</strong> ${utils.formatDate(metadata.fecha_generacion, 'full')}
                        </div>
                        <div class="metadata-item">
                            <strong>Período:</strong> ${metadata.periodo.desde} - ${metadata.periodo.hasta}
                        </div>
                    </div>
                </div>

                <div class="reporte-estadisticas">
                    <h5>Estadísticas Generales</h5>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-history"></i>
                            </div>
                            <div class="stat-info">
                                <h3>${estadisticas.total_registros}</h3>
                                <p>Total Registros</p>
                            </div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-icon success">
                                <i class="fas fa-plus-circle"></i>
                            </div>
                            <div class="stat-info">
                                <h3>${estadisticas.por_accion.INSERT || 0}</h3>
                                <p>Inserciones</p>
                            </div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-icon warning">
                                <i class="fas fa-edit"></i>
                            </div>
                            <div class="stat-info">
                                <h3>${estadisticas.por_accion.UPDATE || 0}</h3>
                                <p>Actualizaciones</p>
                            </div>
                        </div>
                        
                        <div class="stat-card">
                            <div class="stat-icon danger">
                                <i class="fas fa-trash"></i>
                            </div>
                            <div class="stat-info">
                                <h3>${estadisticas.por_accion.DELETE || 0}</h3>
                                <p>Eliminaciones</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="reporte-tablas">
                    <h5>Actividad por Tabla</h5>
                    <table class="reporte-table">
                        <thead>
                            <tr>
                                <th>Tabla</th>
                                <th>Registros</th>
                                <th>Porcentaje</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(estadisticas.por_tabla).map(([tabla, count]) => {
                                const porcentaje = ((count / estadisticas.total_registros) * 100).toFixed(1);
                                return `
                                    <tr>
                                        <td>${tabla}</td>
                                        <td>${count}</td>
                                        <td>${porcentaje}%</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="reporte-usuarios">
                    <h5>Actividad por Usuario</h5>
                    <table class="reporte-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Registros</th>
                                <th>Porcentaje</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(estadisticas.por_usuario).map(([usuario, count]) => {
                                const porcentaje = ((count / estadisticas.total_registros) * 100).toFixed(1);
                                return `
                                    <tr>
                                        <td>${usuario}</td>
                                        <td>${count}</td>
                                        <td>${porcentaje}%</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="reporte-registros-recientes">
                    <h5>Registros Más Recientes</h5>
                    <div class="registros-lista">
                        ${registros.slice(0, 10).map(registro => `
                            <div class="registro-item">
                                <div class="registro-header">
                                    <span class="registro-accion ${this.getAccionClass(registro.accion)}">
                                        ${registro.accion}
                                    </span>
                                    <span class="registro-tabla">${registro.tabla_afectada}</span>
                                    <span class="registro-fecha">${utils.formatDate(registro.creado_en, 'short')}</span>
                                </div>
                                <div class="registro-usuario">
                                    <i class="fas fa-user"></i>
                                    ${registro.empleados?.nombre || 'Sistema'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="reporte-footer">
                    <p class="text-muted">
                        <i class="fas fa-info-circle"></i>
                        Reporte generado automáticamente por FarmaciaSystem.
                        ${estadisticas.total_registros > 100 ? 'Mostrando 100 de ' + estadisticas.total_registros + ' registros.' : ''}
                    </p>
                </div>
            </div>
        `;
    }

    mostrarReporteModal(reporteHtml, reporteData) {
        const modalContent = `
            <div class="reporte-modal">
                <div class="reporte-modal-header">
                    <h4><i class="fas fa-chart-bar"></i> Reporte de Auditoría</h4>
                    <div class="reporte-actions">
                        <button class="btn btn-sm btn-primary" onclick="historial.exportarReportePdf()">
                            <i class="fas fa-file-pdf"></i> Exportar PDF
                        </button>
                        <button class="btn btn-sm btn-success" onclick="historial.exportarReporteExcel()">
                            <i class="fas fa-file-excel"></i> Exportar Excel
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="window.print()">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                    </div>
                </div>
                
                <div class="reporte-modal-body">
                    ${reporteHtml}
                </div>
                
                <div class="reporte-modal-footer">
                    <button type="button" class="btn btn-secondary" 
                            onclick="utils.closeModal('reporteModal')">
                        Cerrar
                    </button>
                    <button type="button" class="btn btn-primary" 
                            onclick="historial.guardarReporteConfig()">
                        <i class="fas fa-save"></i> Guardar Configuración
                    </button>
                </div>
            </div>
        `;

        const modalId = utils.showModal('Reporte de Auditoría', modalContent, {
            id: 'reporteModal',
            footer: ''
        });

        // Guardar datos del reporte para exportación
        this.currentReporteData = reporteData;
    }

    exportarReportePdf() {
        utils.showNotification('Exportación a PDF no implementada aún', 'info');
        // Implementación con jsPDF o similar
    }

    exportarReporteExcel() {
        if (!this.currentReporteData) return;

        try {
            // Preparar datos para Excel
            const excelData = [
                ['Reporte de Auditoría - FarmaciaSystem'],
                ['Fecha generación:', utils.formatDate(this.currentReporteData.metadata.fecha_generacion, 'full')],
                ['Período:', `${this.currentReporteData.metadata.periodo.desde} - ${this.currentReporteData.metadata.periodo.hasta}`],
                [],
                ['ESTADÍSTICAS GENERALES'],
                ['Total Registros:', this.currentReporteData.estadisticas.total_registros],
                ['Inserciones:', this.currentReporteData.estadisticas.por_accion.INSERT || 0],
                ['Actualizaciones:', this.currentReporteData.estadisticas.por_accion.UPDATE || 0],
                ['Eliminaciones:', this.currentReporteData.estadisticas.por_accion.DELETE || 0],
                [],
                ['ACTIVIDAD POR TABLA'],
                ['Tabla', 'Registros', 'Porcentaje'],
                ...Object.entries(this.currentReporteData.estadisticas.por_tabla).map(([tabla, count]) => [
                    tabla,
                    count,
                    `${((count / this.currentReporteData.estadisticas.total_registros) * 100).toFixed(1)}%`
                ]),
                [],
                ['ACTIVIDAD POR USUARIO'],
                ['Usuario', 'Registros', 'Porcentaje'],
                ...Object.entries(this.currentReporteData.estadisticas.por_usuario).map(([usuario, count]) => [
                    usuario,
                    count,
                    `${((count / this.currentReporteData.estadisticas.total_registros) * 100).toFixed(1)}%`
                ]),
                [],
                ['REGISTROS RECIENTES'],
                ['Fecha', 'Acción', 'Tabla', 'Usuario', 'IP'],
                ...this.currentReporteData.registros.slice(0, 50).map(registro => [
                    utils.formatDate(registro.creado_en, 'short'),
                    registro.accion,
                    registro.tabla_afectada,
                    registro.empleados?.nombre || 'Sistema',
                    registro.ip_address || 'N/A'
                ])
            ];

            const filename = `reporte_auditoria_${Date.now()}.csv`;
            utils.exportToCSV(excelData, filename);

            utils.showNotification('Reporte exportado a Excel', 'success');

        } catch (error) {
            console.error('Error exporting report to Excel:', error);
            utils.showNotification('Error exportando reporte', 'error');
        }
    }

    guardarReporteConfig() {
        const config = {
            filtros: {
                fechaDesde: this.filterFechaDesde,
                fechaHasta: this.filterFechaHasta,
                tabla: this.filterTabla,
                accion: this.filterAccion,
                busqueda: this.searchTerm
            },
            ordenamiento: {
                campo: this.sortField,
                orden: this.sortOrder
            },
            guardadoEn: new Date().toISOString()
        };

        localStorage.setItem('historialReportConfig', JSON.stringify(config));
        utils.showNotification('Configuración guardada para futuros reportes', 'success');
    }

    cargarReporteConfig() {
        const configStr = localStorage.getItem('historialReportConfig');
        if (!configStr) return;

        try {
            const config = JSON.parse(configStr);
            
            // Aplicar configuración guardada
            if (config.filtros) {
                this.filterFechaDesde = config.filtros.fechaDesde || '';
                this.filterFechaHasta = config.filtros.fechaHasta || '';
                this.filterTabla = config.filtros.tabla || '';
                this.filterAccion = config.filtros.accion || '';
                this.searchTerm = config.filtros.busqueda || '';
            }

            if (config.ordenamiento) {
                this.sortField = config.ordenamiento.campo || 'creado_en';
                this.sortOrder = config.ordenamiento.orden || 'desc';
            }

            // Actualizar UI
            this.actualizarFiltrosUI();
            
            utils.showNotification('Configuración cargada', 'success');

        } catch (error) {
            console.error('Error loading report config:', error);
        }
    }

    actualizarFiltrosUI() {
        const fechaDesde = document.getElementById('filterFechaDesde');
        const fechaHasta = document.getElementById('filterFechaHasta');
        const tablaFilter = document.getElementById('filterTabla');
        const accionFilter = document.getElementById('filterAccion');
        const searchInput = document.getElementById('searchHistorial');
        const sortSelect = document.getElementById('sortHistorial');

        if (fechaDesde) fechaDesde.value = this.filterFechaDesde;
        if (fechaHasta) fechaHasta.value = this.filterFechaHasta;
        if (tablaFilter) tablaFilter.value = this.filterTabla;
        if (accionFilter) accionFilter.value = this.filterAccion;
        if (searchInput) searchInput.value = this.searchTerm;
        if (sortSelect) sortSelect.value = `${this.sortField}_${this.sortOrder}`;
    }

    // Método para cargar la sección de historial
    async loadHistorialSection() {
        return `
            <div class="historial-section">
                <div class="section-header">
                    <h2><i class="fas fa-history"></i> Historial de Auditoría</h2>
                    <p>Registro completo de todas las acciones realizadas en el sistema</p>
                </div>

                <div class="historial-controls">
                    <div class="controls-left">
                        <div class="search-box">
                            <i class="fas fa-search"></i>
                            <input type="text" id="searchHistorial" 
                                   placeholder="Buscar por tabla o usuario...">
                        </div>
                        
                        <div class="filter-group">
                            <select id="filterTabla" class="form-control">
                                <option value="">Todas las tablas</option>
                                <option value="empleados">Empleados</option>
                                <option value="productos">Productos</option>
                                <option value="ventas">Ventas</option>
                                <option value="detalle_ventas">Detalle Ventas</option>
                                <option value="movimientos_inventario">Movimientos Inventario</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <select id="filterAccion" class="form-control">
                                <option value="">Todas las acciones</option>
                                <option value="INSERT">Inserciones</option>
                                <option value="UPDATE">Actualizaciones</option>
                                <option value="DELETE">Eliminaciones</option>
                                <option value="LOGIN">Inicios de sesión</option>
                                <option value="LOGOUT">Cierres de sesión</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="controls-right">
                        <div class="date-range-group">
                            <div class="date-input">
                                <label for="filterFechaDesde">Desde:</label>
                                <input type="date" id="filterFechaDesde" class="form-control">
                            </div>
                            <div class="date-input">
                                <label for="filterFechaHasta">Hasta:</label>
                                <input type="date" id="filterFechaHasta" class="form-control">
                            </div>
                            <button class="btn btn-secondary" id="aplicarFechaFilter">
                                <i class="fas fa-filter"></i> Aplicar
                            </button>
                        </div>
                        
                        <div class="filter-group">
                            <select id="sortHistorial" class="form-control">
                                <option value="creado_en_desc">Más reciente primero</option>
                                <option value="creado_en_asc">Más antiguo primero</option>
                                <option value="tabla_afectada_asc">Tabla (A-Z)</option>
                                <option value="tabla_afectada_desc">Tabla (Z-A)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="historial-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-history"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="totalRegistros">0</h3>
                            <p>Total Registros</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon info">
                            <i class="fas fa-calendar-day"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="registrosHoy">0</h3>
                            <p>Registros Hoy</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon success">
                            <i class="fas fa-plus-circle"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="accionesInsert">0</h3>
                            <p>Inserciones</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon warning">
                            <i class="fas fa-edit"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="accionesUpdate">0</h3>
                            <p>Actualizaciones</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon danger">
                            <i class="fas fa-trash"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="accionesDelete">0</h3>
                            <p>Eliminaciones</p>
                        </div>
                    </div>
                </div>

                <div class="historial-actions">
                    <button class="btn btn-primary" onclick="historial.generarReporte()">
                        <i class="fas fa-chart-bar"></i> Generar Reporte
                    </button>
                    <button class="btn btn-success" onclick="historial.exportarHistorialCompleto()">
                        <i class="fas fa-download"></i> Exportar Historial
                    </button>
                    <button class="btn btn-secondary" id="clearFilters">
                        <i class="fas fa-broom"></i> Limpiar Filtros
                    </button>
                    <button class="btn btn-info" onclick="historial.cargarReporteConfig()">
                        <i class="fas fa-cog"></i> Cargar Configuración
                    </button>
                </div>

                <div class="historial-container" id="historialContainer">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Cargando historial...</p>
                    </div>
                </div>

                <div class="pagination-container" id="paginationContainer"></div>
            </div>
        `;
    }

    // Método para inicializar cuando se carga la sección
    async initializeHistorialSection() {
        await this.loadHistorial();
        this.cargarReporteConfig();
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.historial = new HistorialManager();
});