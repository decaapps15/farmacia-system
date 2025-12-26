// auth.js - Sistema de Autenticación para Farmacia
import { supabase } from './supabase-client.js';

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentEmployee = null;
        this.init();
    }

    async init() {
        // Verificar sesión al cargar
        await this.checkSession();
        
        // Configurar listeners solo si estamos en login
        if (window.location.pathname.includes('index.html') || 
            window.location.pathname === '/' || 
            window.location.pathname.includes('login')) {
            this.setupLoginEventListeners();
        }
        
        // Configurar logout si estamos en dashboard
        this.setupLogoutListener();
    }

    async checkSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) throw error;
            
            if (session) {
                this.currentUser = session.user;
                await this.loadEmployeeData();
                
                // Redirigir si está en login page
                const currentPath = window.location.pathname;
                const isLoginPage = currentPath.includes('index.html') || 
                                   currentPath === '/' || 
                                   currentPath.includes('login');
                
                if (isLoginPage) {
                    window.location.href = 'dashboard.html';
                }
                
                // Actualizar UI con info del empleado
                this.updateUIWithEmployeeInfo();
                
            } else if (!this.isPublicPage()) {
                // Si no hay sesión y no está en página pública, redirigir a login
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Error checking session:', error);
            
            // Solo mostrar error si no estamos en login
            if (!this.isPublicPage()) {
                this.showMessage('Error verificando sesión. Redirigiendo...', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            }
        }
    }

    isPublicPage() {
        const publicPages = [
            'index.html',
            '/',
            'login.html',
            'reset-password.html',
            'forgot-password.html'
        ];
        
        return publicPages.some(page => window.location.pathname.includes(page));
    }

    async loadEmployeeData() {
        try {
            if (!this.currentUser) return null;
            
            const { data, error } = await supabase
                .from('empleados')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('activo', true)
                .single();

            if (error) throw error;
            
            this.currentEmployee = data;
            
            // Guardar en sessionStorage para acceso rápido
            sessionStorage.setItem('currentEmployee', JSON.stringify(this.currentEmployee));
            
            return this.currentEmployee;
            
        } catch (error) {
            console.error('Error loading employee data:', error);
            
            // Si no encuentra empleado pero sí usuario auth, crear uno automático
            if (error.code === 'PGRST116') {
                console.log('Creando perfil de empleado automático...');
                return await this.createEmployeeProfile();
            }
            
            return null;
        }
    }

    async createEmployeeProfile() {
        try {
            const { data, error } = await supabase
                .from('empleados')
                .insert({
                    user_id: this.currentUser.id,
                    nombre: this.currentUser.email.split('@')[0],
                    email: this.currentUser.email,
                    rol: 'cajero', // Rol por defecto
                    activo: true
                })
                .select()
                .single();

            if (error) throw error;
            
            this.currentEmployee = data;
            sessionStorage.setItem('currentEmployee', JSON.stringify(data));
            
            return data;
            
        } catch (error) {
            console.error('Error creating employee profile:', error);
            return null;
        }
    }

    async login(email, password, rememberMe = false) {
        try {
            this.showMessage('Verificando credenciales...', 'info');
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password: password
            });

            if (error) throw error;

            // Configurar persistencia de sesión
            if (rememberMe) {
                // Guardar en localStorage para recordar usuario
                localStorage.setItem('rememberedEmail', email);
                
                // Establecer expiración más larga
                await supabase.auth.setSession({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token
                });
            } else {
                // Limpiar email recordado
                localStorage.removeItem('rememberedEmail');
            }

            this.currentUser = data.user;
            const employee = await this.loadEmployeeData();
            
            // Registrar login en historial
            await this.logLoginActivity(employee);
            
            this.showMessage(`¡Bienvenido ${employee.nombre}!`, 'success');
            
            // Redirigir después de 1 segundo
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
            
            return { success: true, employee };

        } catch (error) {
            console.error('Login error:', error);
            
            let message = 'Error en el inicio de sesión';
            
            if (error.message.includes('Invalid login credentials')) {
                message = 'Email o contraseña incorrectos';
            } else if (error.message.includes('Email not confirmed')) {
                message = 'Confirma tu correo electrónico primero';
            } else if (error.message.includes('User not found')) {
                message = 'Usuario no registrado';
            } else if (error.message.includes('rate limit')) {
                message = 'Demasiados intentos. Intenta más tarde';
            }
            
            this.showMessage(message, 'error');
            return { success: false, error: message };
        }
    }

    async logLoginActivity(employee) {
        try {
            await supabase
                .from('historial_auditoria')
                .insert({
                    tabla_afectada: 'auth',
                    accion: 'LOGIN',
                    datos_nuevos: {
                        empleado_id: employee.id,
                        empleado_nombre: employee.nombre,
                        timestamp: new Date().toISOString(),
                        user_agent: navigator.userAgent
                    },
                    empleado_id: employee.id
                });
        } catch (error) {
            console.error('Error logging login activity:', error);
        }
    }

    async logout() {
        try {
            // Registrar logout en historial
            if (this.currentEmployee) {
                await this.logLogoutActivity();
            }

            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            // Limpiar todo el almacenamiento
            this.clearStorage();
            
            this.currentUser = null;
            this.currentEmployee = null;
            
            this.showMessage('Sesión cerrada correctamente', 'success');
            
            // Redirigir a login
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
            
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            this.showMessage('Error al cerrar sesión', 'error');
        }
    }

    async logLogoutActivity() {
        try {
            await supabase
                .from('historial_auditoria')
                .insert({
                    tabla_afectada: 'auth',
                    accion: 'LOGOUT',
                    datos_nuevos: {
                        empleado_id: this.currentEmployee.id,
                        empleado_nombre: this.currentEmployee.nombre,
                        timestamp: new Date().toISOString()
                    },
                    empleado_id: this.currentEmployee.id
                });
        } catch (error) {
            console.error('Error logging logout activity:', error);
        }
    }

    clearStorage() {
        sessionStorage.clear();
        localStorage.removeItem('currentEmployee');
        localStorage.removeItem('supabase.auth.token');
    }

    async resetPassword(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password.html`,
            });

            if (error) throw error;

            this.showMessage('Enlace de recuperación enviado a tu correo', 'success');
            return { success: true };

        } catch (error) {
            console.error('Reset password error:', error);
            this.showMessage('Error enviando enlace de recuperación', 'error');
            return { success: false, error };
        }
    }

    hasPermission(requiredRole) {
        if (!this.currentEmployee) return false;
        
        // Jerarquía de roles
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

    setupLoginEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            // Cargar email recordado si existe
            const rememberedEmail = localStorage.getItem('rememberedEmail');
            if (rememberedEmail) {
                document.getElementById('email').value = rememberedEmail;
                document.getElementById('rememberMe').checked = true;
            }
            
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const rememberMe = document.getElementById('rememberMe')?.checked || false;
                
                const btn = document.getElementById('btnLogin');
                if (!btn) return;
                
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
                    toggleBtn.setAttribute('title', 'Ocultar contraseña');
                } else {
                    passwordInput.type = 'password';
                    icon.className = 'fas fa-eye';
                    toggleBtn.setAttribute('title', 'Mostrar contraseña');
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
                setTimeout(() => {
                    document.getElementById('passwordModal').classList.add('hidden');
                }, 2000);
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

    setupLogoutListener() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.logout();
            });
        }
    }

    updateUIWithEmployeeInfo() {
        // Actualizar nombre en navbar si existe
        const userNameElement = document.getElementById('userName');
        if (userNameElement && this.currentEmployee) {
            userNameElement.textContent = this.currentEmployee.nombre;
        }
        
        // Actualizar rol si existe
        const userRoleElement = document.getElementById('userRole');
        if (userRoleElement && this.currentEmployee) {
            userRoleElement.textContent = this.currentEmployee.rol;
        }
    }

    showMessage(message, type = 'info') {
        // Buscar contenedor de mensajes
        let messageEl = document.getElementById('message');
        
        // Crear si no existe
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'message';
            document.body.appendChild(messageEl);
        }
        
        // Configurar mensaje
        messageEl.textContent = message;
        messageEl.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 ${
            type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' :
            type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
            'bg-blue-100 text-blue-800 border border-blue-300'
        }`;
        messageEl.classList.remove('hidden');
        
        // Auto-ocultar
        setTimeout(() => {
            messageEl.classList.add('hidden');
        }, 5000);
    }

    // Método para obtener empleado actual (para otros módulos)
    getCurrentEmployee() {
        return this.currentEmployee;
    }

    // Método para verificar si está autenticado
    isAuthenticated() {
        return !!this.currentUser && !!this.currentEmployee;
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

// Exportar para uso en otros módulos
export default AuthManager;
