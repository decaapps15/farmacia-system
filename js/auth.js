class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentEmployee = null;
        this.init();
    }

    async init() {
        await this.checkSession();
        this.setupEventListeners();
    }

    async checkSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) throw error;
            
            if (session) {
                this.currentUser = session.user;
                await this.loadEmployeeData();
                
                // Redirigir si está en login
                if (window.location.pathname.includes('index.html')) {
                    window.location.href = 'dashboard.html';
                }
            } else if (!window.location.pathname.includes('index.html')) {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Error checking session:', error);
            this.showMessage('Error verificando sesión', 'error');
        }
    }

    async loadEmployeeData() {
        try {
            if (!this.currentUser) return;
            
            this.currentEmployee = await db.getCurrentEmployee();
            
            if (!this.currentEmployee) {
                console.warn('Empleado no encontrado para el usuario actual');
            }
            
            // Guardar en sessionStorage para uso inmediato
            sessionStorage.setItem('employee', JSON.stringify(this.currentEmployee));
            
        } catch (error) {
            console.error('Error loading employee data:', error);
        }
    }

    async login(email, password, rememberMe = false) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) throw error;

            // Configurar persistencia de sesión
            if (rememberMe) {
                const { error: persistError } = await supabase.auth.setSession({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token
                });
                if (persistError) throw persistError;
            }

            this.currentUser = data.user;
            await this.loadEmployeeData();
            
            this.showMessage('Inicio de sesión exitoso', 'success');
            return { success: true, employee: this.currentEmployee };

        } catch (error) {
            let message = 'Error en el inicio de sesión';
            
            if (error.message.includes('Invalid login credentials')) {
                message = 'Credenciales incorrectas';
            } else if (error.message.includes('Email not confirmed')) {
                message = 'Confirma tu correo electrónico primero';
            } else if (error.message.includes('User not found')) {
                message = 'Usuario no registrado';
            }
            
            this.showMessage(message, 'error');
            return { success: false, error: message };
        }
    }

    async logout() {
        try {
            // Registrar cierre de sesión en historial
            if (this.currentEmployee) {
                await db.query('historial_auditoria', 'insert', {
                    data: {
                        tabla_afectada: 'auth',
                        accion: 'LOGOUT',
                        datos_nuevos: { 
                            empleado: this.currentEmployee.nombre,
                            timestamp: new Date().toISOString()
                        },
                        empleado_id: this.currentEmployee.id
                    }
                });
            }

            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            // Limpiar almacenamiento local
            sessionStorage.clear();
            localStorage.removeItem('employee');
            
            this.currentUser = null;
            this.currentEmployee = null;
            
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            this.showMessage('Error al cerrar sesión', 'error');
        }
    }

    async resetPassword(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password.html`,
            });

            if (error) throw error;

            this.showMessage('Enlace de recuperación enviado', 'success');
            return { success: true };

        } catch (error) {
            this.showMessage('Error enviando enlace de recuperación', 'error');
            return { success: false, error };
        }
    }

    hasPermission(requiredRole) {
        if (!this.currentEmployee) return false;
        
        const roleHierarchy = {
            'admin': 4,
            'supervisor': 3,
            'almacen': 2,
            'cajero': 1
        };
        
        const userRoleLevel = roleHierarchy[this.currentEmployee.rol] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
        
        // Admin tiene acceso a todo
        if (this.currentEmployee.rol === 'admin') return true;
        
        // Verificar acceso basado en jerarquía
        return userRoleLevel >= requiredRoleLevel;
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const rememberMe = document.getElementById('rememberMe').checked;
                
                const btn = document.getElementById('btnLogin');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
                btn.disabled = true;
                
                await this.login(email, password, rememberMe);
                
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        }

        // Toggle password visibility
        const toggleBtn = document.getElementById('togglePassword');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const passwordInput = document.getElementById('password');
                const icon = toggleBtn.querySelector('i');
                
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    icon.className = 'fas fa-eye-slash';
                } else {
                    passwordInput.type = 'password';
                    icon.className = 'fas fa-eye';
                }
            });
        }

        // Password recovery
        const forgotPassword = document.getElementById('forgotPassword');
        if (forgotPassword) {
            forgotPassword.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('passwordModal').classList.remove('hidden');
            });
        }

        // Recovery form
        const recoveryForm = document.getElementById('recoveryForm');
        if (recoveryForm) {
            recoveryForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('recoveryEmail').value;
                await this.resetPassword(email);
                document.getElementById('passwordModal').classList.add('hidden');
            });
        }

        // Close modal
        const closeModal = document.querySelector('.close-modal');
        if (closeModal) {
            closeModal.addEventListener('click', () => {
                document.getElementById('passwordModal').classList.add('hidden');
            });
        }
    }

    showMessage(message, type = 'info') {
        const messageEl = document.getElementById('message');
        if (!messageEl) return;
        
        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
        messageEl.classList.remove('hidden');
        
        // Auto-ocultar después de 5 segundos
        setTimeout(() => {
            messageEl.classList.add('hidden');
        }, 5000);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});