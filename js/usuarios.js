// usuarios.js - Gestión de usuarios/empleados
class UsuariosManager {
    constructor() {
        this.usuarios = [];
        this.filteredUsuarios = [];
        this.currentPage = 1;
        this.itemsPerPage = 15;
        this.searchTerm = '';
        this.sortField = 'nombre';
        this.sortOrder = 'asc';
        this.currentUser = null;
        this.init();
    }

    async init() {
        await this.checkPermissions();
        this.setupEventListeners();
        this.loadUsuarios();
        this.setupSearch();
        this.setupFilters();
    }

    async checkPermissions() {
        const employee = await db.getCurrentEmployee();
        if (!employee) {
            window.location.href = 'index.html';
            return;
        }

        // Solo administradores pueden gestionar usuarios
        if (employee.rol !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }

        this.currentUser = employee;
    }

    async loadUsuarios(page = 1) {
        try {
            this.currentPage = page;
            
            // Mostrar loading
            this.showLoading();
            
            let query = supabase
                .from('empleados')
                .select(`
                    *,
                    auth_user:user_id (
                        email,
                        last_sign_in_at
                    )
                `)
                .order(this.sortField, { ascending: this.sortOrder === 'asc' });

            // Aplicar búsqueda si existe
            if (this.searchTerm) {
                query = query.or(`nombre.ilike.%${this.searchTerm}%,email.ilike.%${this.searchTerm}%`);
            }

            // Aplicar paginación
            const from = (page - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data: usuarios, error, count } = await query;

            if (error) throw error;

            this.usuarios = usuarios || [];
            this.filteredUsuarios = [...this.usuarios];
            
            // Obtener total de usuarios para paginación
            const { count: totalCount } = await supabase
                .from('empleados')
                .select('*', { count: 'exact', head: true });

            this.totalUsuarios = totalCount || 0;
            
            this.renderUsuarios();
            this.renderPagination();
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('Error cargando usuarios');
        }
    }

    renderUsuarios() {
        const container = document.getElementById('usuariosContainer');
        if (!container) return;

        if (this.usuarios.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No hay usuarios registrados</h3>
                    <p>${this.searchTerm ? 'No se encontraron usuarios con esa búsqueda' : 'Comienza agregando el primer usuario'}</p>
                    ${!this.searchTerm ? `
                        <button class="btn btn-primary" onclick="usuarios.showAddUserModal()">
                            <i class="fas fa-user-plus"></i> Agregar Usuario
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }

        const usuariosHtml = this.usuarios.map(usuario => {
            const isCurrentUser = usuario.id === this.currentUser?.id;
            const lastLogin = usuario.auth_user?.last_sign_in_at 
                ? utils.getRelativeTime(usuario.auth_user.last_sign_in_at)
                : 'Nunca';
            
            return `
                <div class="usuario-card ${!usuario.activo ? 'inactive' : ''} ${isCurrentUser ? 'current-user' : ''}" 
                     data-user-id="${usuario.id}">
                    
                    <div class="usuario-header">
                        <div class="usuario-avatar">
                            ${usuario.nombre.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div class="usuario-info">
                            <h4 class="usuario-nombre">${usuario.nombre}</h4>
                            <div class="usuario-email">${usuario.email}</div>
                        </div>
                        <div class="usuario-actions">
                            <button class="btn-icon" onclick="usuarios.showEditUserModal('${usuario.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${!isCurrentUser ? `
                                <button class="btn-icon ${usuario.activo ? 'btn-danger' : 'btn-success'}" 
                                        onclick="usuarios.toggleUserStatus('${usuario.id}', ${usuario.activo})">
                                    <i class="fas fa-${usuario.activo ? 'user-slash' : 'user-check'}"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="usuario-body">
                        <div class="usuario-metadata">
                            <div class="metadata-item">
                                <i class="fas fa-user-tag"></i>
                                <span class="label">Rol:</span>
                                <span class="value">
                                    <span class="badge badge-${this.getRoleBadgeClass(usuario.rol)}">
                                        ${usuario.rol.toUpperCase()}
                                    </span>
                                </span>
                            </div>
                            
                            <div class="metadata-item">
                                <i class="fas fa-calendar"></i>
                                <span class="label">Registrado:</span>
                                <span class="value">${utils.formatDate(usuario.creado_en, 'short')}</span>
                            </div>
                            
                            <div class="metadata-item">
                                <i class="fas fa-sign-in-alt"></i>
                                <span class="label">Último acceso:</span>
                                <span class="value">${lastLogin}</span>
                            </div>
                            
                            <div class="metadata-item">
                                <i class="fas fa-circle"></i>
                                <span class="label">Estado:</span>
                                <span class="value">
                                    <span class="status-indicator ${usuario.activo ? 'active' : 'inactive'}">
                                        <i class="fas fa-circle"></i>
                                        ${usuario.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </span>
                            </div>
                        </div>
                        
                        ${usuario.rol === 'admin' ? `
                            <div class="usuario-warning">
                                <i class="fas fa-shield-alt"></i>
                                <span>Usuario con permisos de administrador total</span>
                            </div>
                        ` : ''}
                        
                        ${isCurrentUser ? `
                            <div class="usuario-notice">
                                <i class="fas fa-user"></i>
                                <span>Tú</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="usuario-footer">
                        <div class="usuario-id">
                            <small>ID: ${usuario.id.substring(0, 8)}...</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = usuariosHtml;
    }

    getRoleBadgeClass(rol) {
        const roleClasses = {
            'admin': 'danger',
            'supervisor': 'warning',
            'almacen': 'info',
            'cajero': 'success'
        };
        return roleClasses[rol] || 'secondary';
    }

    renderPagination() {
        const paginationContainer = document.getElementById('paginationContainer');
        if (!paginationContainer) return;

        const totalPages = Math.ceil(this.totalUsuarios / this.itemsPerPage);
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHtml = `
            <div class="pagination">
                <button class="page-btn ${this.currentPage === 1 ? 'disabled' : ''}" 
                        onclick="usuarios.loadUsuarios(${this.currentPage - 1})" 
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
                <button class="page-btn" onclick="usuarios.loadUsuarios(1)">1</button>
                ${startPage > 2 ? '<span class="page-dots">...</span>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="page-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="usuarios.loadUsuarios(${i})">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            paginationHtml += `
                ${endPage < totalPages - 1 ? '<span class="page-dots">...</span>' : ''}
                <button class="page-btn" onclick="usuarios.loadUsuarios(${totalPages})">
                    ${totalPages}
                </button>
            `;
        }

        paginationHtml += `
                <button class="page-btn ${this.currentPage === totalPages ? 'disabled' : ''}" 
                        onclick="usuarios.loadUsuarios(${this.currentPage + 1})" 
                        ${this.currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="pagination-info">
                Mostrando ${((this.currentPage - 1) * this.itemsPerPage) + 1} - 
                ${Math.min(this.currentPage * this.itemsPerPage, this.totalUsuarios)} 
                de ${this.totalUsuarios} usuarios
            </div>
        `;

        paginationContainer.innerHTML = paginationHtml;
    }

    showAddUserModal() {
        const modalContent = `
            <form id="addUserForm" class="user-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="userName">
                            <i class="fas fa-user"></i> Nombre Completo *
                        </label>
                        <input type="text" id="userName" name="nombre" required 
                               placeholder="Ej: Juan Pérez" maxlength="100">
                    </div>
                    
                    <div class="form-group">
                        <label for="userEmail">
                            <i class="fas fa-envelope"></i> Correo Electrónico *
                        </label>
                        <input type="email" id="userEmail" name="email" required 
                               placeholder="usuario@farmacia.com">
                        <div class="form-help">El usuario usará este email para iniciar sesión</div>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="userRole">
                            <i class="fas fa-user-tag"></i> Rol del Usuario *
                        </label>
                        <select id="userRole" name="rol" required>
                            <option value="">Seleccionar rol...</option>
                            <option value="admin">Administrador</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="almacen">Almacén/Inventario</option>
                            <option value="cajero">Cajero</option>
                        </select>
                        <div class="form-help">
                            <strong>Permisos:</strong>
                            <ul class="role-permissions">
                                <li><strong>Admin:</strong> Acceso total al sistema</li>
                                <li><strong>Supervisor:</strong> Ver reportes e historial</li>
                                <li><strong>Almacén:</strong> Gestionar inventario</li>
                                <li><strong>Cajero:</strong> Realizar ventas</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="userPassword">
                            <i class="fas fa-lock"></i> Contraseña Temporal *
                        </label>
                        <div class="password-input-group">
                            <input type="text" id="userPassword" name="password" required 
                                   value="${this.generateTempPassword()}" readonly>
                            <button type="button" class="btn-icon" onclick="usuarios.generateNewPassword()">
                                <i class="fas fa-redo"></i>
                            </button>
                            <button type="button" class="btn-icon" onclick="usuarios.copyPassword()">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <div class="form-help">El usuario deberá cambiar esta contraseña en su primer acceso</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="sendInvitation">
                        <i class="fas fa-paper-plane"></i> Enviar Invitación
                    </label>
                    <div class="checkbox-group">
                        <input type="checkbox" id="sendInvitation" name="send_invitation" checked>
                        <label for="sendInvitation" class="checkbox-label">
                            Enviar correo de invitación con las credenciales
                        </label>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="utils.closeModal('addUserModal')">
                        Cancelar
                    </button>
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-user-plus"></i> Crear Usuario
                    </button>
                </div>
            </form>
        `;

        const modalId = utils.showModal('Agregar Nuevo Usuario', modalContent, {
            id: 'addUserModal',
            footer: ''
        });

        this.setupUserForm('addUserForm', 'add');
    }

    generateTempPassword() {
        const length = 10;
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let password = "";
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return password;
    }

    generateNewPassword() {
        const passwordInput = document.getElementById('userPassword');
        if (passwordInput) {
            passwordInput.value = this.generateTempPassword();
        }
    }

    copyPassword() {
        const passwordInput = document.getElementById('userPassword');
        if (passwordInput) {
            navigator.clipboard.writeText(passwordInput.value)
                .then(() => {
                    utils.showNotification('Contraseña copiada al portapapeles', 'success');
                })
                .catch(err => {
                    console.error('Error copying password:', err);
                    utils.showNotification('Error copiando contraseña', 'error');
                });
        }
    }

    async showEditUserModal(userId) {
        try {
            const { data: usuario, error } = await supabase
                .from('empleados')
                .select(`
                    *,
                    auth_user:user_id (
                        email,
                        last_sign_in_at
                    )
                `)
                .eq('id', userId)
                .single();

            if (error) throw error;

            const modalContent = `
                <form id="editUserForm" class="user-form">
                    <input type="hidden" id="editUserId" name="id" value="${usuario.id}">
                    <input type="hidden" id="editUserEmail" value="${usuario.email}">
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editUserName">
                                <i class="fas fa-user"></i> Nombre Completo *
                            </label>
                            <input type="text" id="editUserName" name="nombre" required 
                                   value="${usuario.nombre}" maxlength="100">
                        </div>
                        
                        <div class="form-group">
                            <label for="editUserEmailDisplay">
                                <i class="fas fa-envelope"></i> Correo Electrónico
                            </label>
                            <input type="text" id="editUserEmailDisplay" 
                                   value="${usuario.email}" readonly disabled>
                            <div class="form-help">El email no se puede modificar</div>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="editUserRole">
                                <i class="fas fa-user-tag"></i> Rol del Usuario *
                            </label>
                            <select id="editUserRole" name="rol" required>
                                <option value="">Seleccionar rol...</option>
                                <option value="admin" ${usuario.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                                <option value="supervisor" ${usuario.rol === 'supervisor' ? 'selected' : ''}>Supervisor</option>
                                <option value="almacen" ${usuario.rol === 'almacen' ? 'selected' : ''}>Almacén/Inventario</option>
                                <option value="cajero" ${usuario.rol === 'cajero' ? 'selected' : ''}>Cajero</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="editUserStatus">
                                <i class="fas fa-toggle-on"></i> Estado del Usuario
                            </label>
                            <select id="editUserStatus" name="activo">
                                <option value="true" ${usuario.activo ? 'selected' : ''}>Activo</option>
                                <option value="false" ${!usuario.activo ? 'selected' : ''}>Inactivo</option>
                            </select>
                            <div class="form-help">Los usuarios inactivos no pueden iniciar sesión</div>
                        </div>
                    </div>
                    
                    <div class="password-reset-section">
                        <h5><i class="fas fa-key"></i> Restablecer Contraseña</h5>
                        <div class="checkbox-group">
                            <input type="checkbox" id="resetPassword">
                            <label for="resetPassword" class="checkbox-label">
                                Restablecer contraseña del usuario
                            </label>
                        </div>
                        
                        <div id="newPasswordGroup" class="form-group" style="display: none;">
                            <label for="newPassword">
                                Nueva Contraseña Temporal
                            </label>
                            <div class="password-input-group">
                                <input type="text" id="newPassword" 
                                       value="${this.generateTempPassword()}" readonly>
                                <button type="button" class="btn-icon" onclick="usuarios.generateNewEditPassword()">
                                    <i class="fas fa-redo"></i>
                                </button>
                                <button type="button" class="btn-icon" onclick="usuarios.copyEditPassword()">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <div class="form-help">El usuario deberá cambiar esta contraseña en su próximo acceso</div>
                        </div>
                    </div>
                    
                    <div class="user-info-section">
                        <h5><i class="fas fa-info-circle"></i> Información del Usuario</h5>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">Último acceso:</span>
                                <span class="info-value">
                                    ${usuario.auth_user?.last_sign_in_at 
                                        ? utils.formatDate(usuario.auth_user.last_sign_in_at, 'full')
                                        : 'Nunca'}
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Fecha registro:</span>
                                <span class="info-value">
                                    ${utils.formatDate(usuario.creado_en, 'full')}
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Usuario ID:</span>
                                <span class="info-value">${usuario.id}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="utils.closeModal('editUserModal')">
                            Cancelar
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Actualizar Usuario
                        </button>
                    </div>
                </form>
            `;

            const modalId = utils.showModal('Editar Usuario', modalContent, {
                id: 'editUserModal',
                footer: ''
            });

            this.setupUserForm('editUserForm', 'edit');
            this.setupPasswordResetToggle();

        } catch (error) {
            console.error('Error loading user for edit:', error);
            utils.showNotification('Error cargando usuario', 'error');
        }
    }

    setupPasswordResetToggle() {
        const resetCheckbox = document.getElementById('resetPassword');
        const passwordGroup = document.getElementById('newPasswordGroup');

        if (resetCheckbox && passwordGroup) {
            resetCheckbox.addEventListener('change', () => {
                passwordGroup.style.display = resetCheckbox.checked ? 'block' : 'none';
            });
        }
    }

    generateNewEditPassword() {
        const passwordInput = document.getElementById('newPassword');
        if (passwordInput) {
            passwordInput.value = this.generateTempPassword();
        }
    }

    copyEditPassword() {
        const passwordInput = document.getElementById('newPassword');
        if (passwordInput) {
            navigator.clipboard.writeText(passwordInput.value)
                .then(() => {
                    utils.showNotification('Contraseña copiada al portapapeles', 'success');
                })
                .catch(err => {
                    console.error('Error copying password:', err);
                    utils.showNotification('Error copiando contraseña', 'error');
                });
        }
    }

    setupUserForm(formId, action) {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const userData = Object.fromEntries(formData.entries());
            
            // Convertir valores booleanos
            if (userData.activo) {
                userData.activo = userData.activo === 'true';
            }

            try {
                if (action === 'add') {
                    await this.createUser(userData);
                } else if (action === 'edit') {
                    await this.updateUser(userData);
                }

                utils.closeModal(`${action}UserModal`);
                await this.loadUsuarios(this.currentPage);
                
            } catch (error) {
                console.error(`Error ${action} user:`, error);
                
                if (error.message.includes('already registered')) {
                    utils.showNotification('El correo electrónico ya está registrado', 'error');
                } else {
                    utils.showNotification(`Error al ${action === 'add' ? 'crear' : 'actualizar'} usuario`, 'error');
                }
            }
        });
    }

    async createUser(userData) {
        try {
            // 1. Crear usuario en Auth
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: userData.email,
                password: userData.password,
                email_confirm: true,
                user_metadata: {
                    nombre: userData.nombre,
                    rol: userData.rol
                }
            });

            if (authError) throw authError;

            // 2. Crear registro en empleados
            const empleadoData = {
                user_id: authData.user.id,
                nombre: userData.nombre,
                email: userData.email,
                rol: userData.rol,
                activo: true
            };

            const { error: empleadoError } = await supabase
                .from('empleados')
                .insert([empleadoData]);

            if (empleadoError) throw empleadoError;

            // 3. Enviar correo de invitación si está seleccionado
            if (document.getElementById('sendInvitation')?.checked) {
                await this.sendInvitationEmail(userData.email, userData.password);
            }

            utils.showNotification('Usuario creado exitosamente', 'success');

        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async updateUser(userData) {
        try {
            // 1. Actualizar datos del empleado
            const updateData = {
                nombre: userData.nombre,
                rol: userData.rol,
                activo: userData.activo,
                actualizado_en: new Date().toISOString()
            };

            const { error: empleadoError } = await supabase
                .from('empleados')
                .update(updateData)
                .eq('id', userData.id);

            if (empleadoError) throw empleadoError;

            // 2. Restablecer contraseña si está seleccionado
            const resetPassword = document.getElementById('resetPassword')?.checked;
            if (resetPassword) {
                const newPassword = document.getElementById('newPassword').value;
                
                // Obtener user_id del empleado
                const { data: empleado, error: fetchError } = await supabase
                    .from('empleados')
                    .select('user_id')
                    .eq('id', userData.id)
                    .single();

                if (!fetchError && empleado.user_id) {
                    await supabase.auth.admin.updateUserById(
                        empleado.user_id,
                        { password: newPassword }
                    );

                    // Enviar correo de restablecimiento
                    await this.sendPasswordResetEmail(userData.email);
                }
            }

            utils.showNotification('Usuario actualizado exitosamente', 'success');

        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    async sendInvitationEmail(email, password) {
        try {
            // En un sistema real, aquí se integraría con un servicio de email
            // Por ahora, mostramos un mensaje
            console.log(`Invitación enviada a ${email} con contraseña: ${password}`);
            
            utils.showNotification(
                `Invitación enviada a ${email}. Contraseña: ${password}`,
                'info'
            );

        } catch (error) {
            console.error('Error sending invitation email:', error);
            // No lanzamos error para no interrumpir el flujo principal
        }
    }

    async sendPasswordResetEmail(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`,
            });

            if (error) throw error;

            utils.showNotification('Correo de restablecimiento enviado', 'success');

        } catch (error) {
            console.error('Error sending reset email:', error);
            utils.showNotification('Error enviando correo de restablecimiento', 'error');
        }
    }

    async toggleUserStatus(userId, currentStatus) {
        const action = currentStatus ? 'desactivar' : 'activar';
        const confirmed = await utils.showConfirm(
            `${currentStatus ? 'Desactivar' : 'Activar'} Usuario`,
            `¿Estás seguro de que deseas ${action} este usuario? ${
                currentStatus 
                ? 'No podrá iniciar sesión hasta que sea reactivado.' 
                : 'El usuario podrá volver a iniciar sesión.'
            }`,
            {
                okText: currentStatus ? 'Desactivar' : 'Activar',
                cancelText: 'Cancelar'
            }
        );

        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('empleados')
                .update({ 
                    activo: !currentStatus,
                    actualizado_en: new Date().toISOString()
                })
                .eq('id', userId);

            if (error) throw error;

            utils.showNotification(
                `Usuario ${currentStatus ? 'desactivado' : 'activado'} exitosamente`,
                'success'
            );

            await this.loadUsuarios(this.currentPage);

        } catch (error) {
            console.error('Error toggling user status:', error);
            utils.showNotification('Error cambiando estado del usuario', 'error');
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('searchUsuarios');
        if (!searchInput) return;

        const searchHandler = utils.debounce((e) => {
            this.searchTerm = e.target.value.trim();
            this.loadUsuarios(1);
        }, 300);

        searchInput.addEventListener('input', searchHandler);
    }

    setupFilters() {
        const roleFilter = document.getElementById('filterRole');
        if (roleFilter) {
            roleFilter.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.filterByRole(e.target.value);
                } else {
                    this.loadUsuarios(1);
                }
            });
        }

        const statusFilter = document.getElementById('filterStatus');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                if (e.target.value !== 'all') {
                    this.filterByStatus(e.target.value === 'active');
                } else {
                    this.loadUsuarios(1);
                }
            });
        }

        const sortSelect = document.getElementById('sortUsuarios');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                const [field, order] = e.target.value.split('_');
                this.sortField = field;
                this.sortOrder = order;
                this.loadUsuarios(1);
            });
        }
    }

    async filterByRole(rol) {
        try {
            const { data: usuarios, error } = await supabase
                .from('empleados')
                .select(`
                    *,
                    auth_user:user_id (
                        email,
                        last_sign_in_at
                    )
                `)
                .eq('rol', rol)
                .order(this.sortField, { ascending: this.sortOrder === 'asc' });

            if (error) throw error;

            this.usuarios = usuarios || [];
            this.renderUsuarios();

            // Limpiar paginación
            const paginationContainer = document.getElementById('paginationContainer');
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
            }

        } catch (error) {
            console.error('Error filtering by role:', error);
            utils.showNotification('Error filtrando usuarios', 'error');
        }
    }

    async filterByStatus(activo) {
        try {
            const { data: usuarios, error } = await supabase
                .from('empleados')
                .select(`
                    *,
                    auth_user:user_id (
                        email,
                        last_sign_in_at
                    )
                `)
                .eq('activo', activo)
                .order(this.sortField, { ascending: this.sortOrder === 'asc' });

            if (error) throw error;

            this.usuarios = usuarios || [];
            this.renderUsuarios();

            // Limpiar paginación
            const paginationContainer = document.getElementById('paginationContainer');
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
            }

        } catch (error) {
            console.error('Error filtering by status:', error);
            utils.showNotification('Error filtrando usuarios', 'error');
        }
    }

    showLoading() {
        const container = document.getElementById('usuariosContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando usuarios...</p>
            </div>
        `;
    }

    showError(message) {
        const container = document.getElementById('usuariosContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="usuarios.loadUsuarios()">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }

    updateStats() {
        // Actualizar estadísticas en la UI si existen
        const activeUsers = this.usuarios.filter(u => u.activo).length;
        const adminCount = this.usuarios.filter(u => u.rol === 'admin').length;
        const cajeroCount = this.usuarios.filter(u => u.rol === 'cajero').length;

        const activeElement = document.getElementById('activeUsersCount');
        const adminElement = document.getElementById('adminUsersCount');
        const cajeroElement = document.getElementById('cajeroUsersCount');

        if (activeElement) activeElement.textContent = activeUsers;
        if (adminElement) adminElement.textContent = adminCount;
        if (cajeroElement) cajeroElement.textContent = cajeroCount;
    }

    // Método para cargar la sección de usuarios
    async loadUsersSection() {
        return `
            <div class="usuarios-section">
                <div class="section-header">
                    <h2><i class="fas fa-users-cog"></i> Gestión de Usuarios</h2>
                    <p>Administra los empleados y sus permisos en el sistema</p>
                </div>

                <div class="usuarios-controls">
                    <div class="controls-left">
                        <div class="search-box">
                            <i class="fas fa-search"></i>
                            <input type="text" id="searchUsuarios" 
                                   placeholder="Buscar por nombre o email...">
                        </div>
                        
                        <div class="filter-group">
                            <select id="filterRole" class="form-control">
                                <option value="">Todos los roles</option>
                                <option value="admin">Administradores</option>
                                <option value="supervisor">Supervisores</option>
                                <option value="almacen">Almacén</option>
                                <option value="cajero">Cajeros</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <select id="filterStatus" class="form-control">
                                <option value="all">Todos los estados</option>
                                <option value="active">Solo activos</option>
                                <option value="inactive">Solo inactivos</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="controls-right">
                        <div class="filter-group">
                            <select id="sortUsuarios" class="form-control">
                                <option value="nombre_asc">Ordenar por: Nombre (A-Z)</option>
                                <option value="nombre_desc">Ordenar por: Nombre (Z-A)</option>
                                <option value="rol_asc">Ordenar por: Rol</option>
                                <option value="creado_en_desc">Ordenar por: Más reciente</option>
                                <option value="creado_en_asc">Ordenar por: Más antiguo</option>
                            </select>
                        </div>
                        
                        <button class="btn btn-primary" onclick="usuarios.showAddUserModal()">
                            <i class="fas fa-user-plus"></i> Nuevo Usuario
                        </button>
                    </div>
                </div>

                <div class="usuarios-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="totalUsersCount">${this.totalUsuarios || 0}</h3>
                            <p>Usuarios Totales</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon success">
                            <i class="fas fa-user-check"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="activeUsersCount">0</h3>
                            <p>Usuarios Activos</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon warning">
                            <i class="fas fa-user-shield"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="adminUsersCount">0</h3>
                            <p>Administradores</p>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon info">
                            <i class="fas fa-cash-register"></i>
                        </div>
                        <div class="stat-info">
                            <h3 id="cajeroUsersCount">0</h3>
                            <p>Cajeros</p>
                        </div>
                    </div>
                </div>

                <div class="usuarios-container" id="usuariosContainer">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Cargando usuarios...</p>
                    </div>
                </div>

                <div class="pagination-container" id="paginationContainer"></div>
            </div>
        `;
    }

    // Método para inicializar cuando se carga la sección
    async initializeUsersSection() {
        await this.loadUsuarios();
        this.updateStats();
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.usuarios = new UsuariosManager();
});