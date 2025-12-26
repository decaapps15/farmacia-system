// dashboard.js - Colócalo en la misma carpeta
import { supabase } from './supabase-client.js';

// dashboard.js - Versión simplificada
class Dashboard {
    constructor() {
        this.currentEmployee = null;
        this.currentSection = 'inicio';
        this.init();
    }

    async init() {
        await this.loadEmployeeData();
        this.setupUI();
        this.setupEventListeners();
        this.loadSection(this.currentSection);
    }

    async loadEmployeeData() {
        try {
            const employeeData = sessionStorage.getItem('employee');
            if (employeeData) {
                this.currentEmployee = JSON.parse(employeeData);
            } else {
                this.currentEmployee = await db.getCurrentEmployee();
                if (this.currentEmployee) {
                    sessionStorage.setItem('employee', JSON.stringify(this.currentEmployee));
                }
            }

            this.updateUI();
        } catch (error) {
            console.error('Error loading employee data:', error);
        }
    }

    updateUI() {
        // Actualizar nombre del usuario
        const userNameElement = document.getElementById('userName');
        if (userNameElement && this.currentEmployee) {
            userNameElement.textContent = this.currentEmployee.nombre;
        }

        // Actualizar rol del usuario
        const userRoleElement = document.getElementById('userRole');
        if (userRoleElement && this.currentEmployee) {
            userRoleElement.textContent = this.currentEmployee.rol.toUpperCase();
        }
    }

    setupUI() {
        // Configurar fecha y hora actual
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 60000);
    }

    updateDateTime() {
        const now = new Date();
        const dateElement = document.getElementById('currentDate');
        const timeElement = document.getElementById('currentTime');
        
        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
        
        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    async loadSection(section) {
        this.currentSection = section;
        
        // Actualizar menú activo
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeMenuItem = document.getElementById(`menu-${section}`);
        if (activeMenuItem) {
            activeMenuItem.classList.add('active');
        }

        // Limpiar contenido actual
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        contentArea.innerHTML = `
            <div class="loading-screen">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Cargando ${section}...</p>
            </div>
        `;

        try {
            let sectionHTML = '';
            
            switch(section) {
                case 'inicio':
                    sectionHTML = await this.loadHomeSection();
                    break;
                case 'inventario':
                    sectionHTML = await this.loadInventorySection();
                    break;
                case 'ventas':
                    sectionHTML = await this.loadSalesSection();
                    break;
                case 'usuarios':
                    sectionHTML = await this.loadUsersSection();
                    break;
                case 'historial':
                    sectionHTML = await this.loadHistorySection();
                    break;
                default:
                    sectionHTML = await this.loadHomeSection();
            }

            contentArea.innerHTML = sectionHTML;
            
        } catch (error) {
            console.error(`Error loading section ${section}:`, error);
            contentArea.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error cargando la sección</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    async loadHomeSection() {
        return `
            <div class="home-section">
                <div class="welcome-card card">
                    <h2>Bienvenido, ${this.currentEmployee?.nombre || 'Usuario'}</h2>
                    <p>Sistema de Gestión Farmacéutica - Versión 1.0</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card card">
                        <div class="stat-icon">
                            <i class="fas fa-boxes"></i>
                        </div>
                        <div class="stat-info">
                            <h3>0</h3>
                            <p>Productos en Stock</p>
                        </div>
                    </div>
                    
                    <div class="stat-card card">
                        <div class="stat-icon success">
                            <i class="fas fa-shopping-cart"></i>
                        </div>
                        <div class="stat-info">
                            <h3>0</h3>
                            <p>Ventas Hoy</p>
                        </div>
                    </div>
                    
                    <div class="stat-card card">
                        <div class="stat-icon warning">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div class="stat-info">
                            <h3>0</h3>
                            <p>Stock Bajo</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadInventorySection() {
        return `
            <div class="inventory-section">
                <div class="section-header card">
                    <h2><i class="fas fa-boxes"></i> Gestión de Inventario</h2>
                    <p>Administra los productos de la farmacia</p>
                </div>
                
                <div class="card">
                    <h3>Lista de Productos</h3>
                    <p>El módulo de inventario se cargará aquí...</p>
                </div>
            </div>
        `;
    }

    async loadSalesSection() {
        return `
            <div class="sales-section">
                <div class="section-header card">
                    <h2><i class="fas fa-cash-register"></i> Punto de Venta</h2>
                    <p>Procesa ventas rápidas y eficientes</p>
                </div>
                
                <div class="card">
                    <h3>Carrito de Venta</h3>
                    <p>El módulo de ventas se cargará aquí...</p>
                </div>
            </div>
        `;
    }

    async loadUsersSection() {
        return `
            <div class="users-section">
                <div class="section-header card">
                    <h2><i class="fas fa-users-cog"></i> Gestión de Usuarios</h2>
                    <p>Administra los empleados y sus permisos</p>
                </div>
                
                <div class="card">
                    <h3>Lista de Usuarios</h3>
                    <p>El módulo de usuarios se cargará aquí...</p>
                </div>
            </div>
        `;
    }

    async loadHistorySection() {
        return `
            <div class="history-section">
                <div class="section-header card">
                    <h2><i class="fas fa-history"></i> Historial de Auditoría</h2>
                    <p>Registro completo de todas las acciones</p>
                </div>
                
                <div class="card">
                    <h3>Registros de Actividad</h3>
                    <p>El módulo de historial se cargará aquí...</p>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Navegación del menú
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.loadSection(section);
            });
        });

        // Botón de cerrar sesión
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                    await window.authManager.logout();
                }
            });
        }
    }
}

// Inicializar dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();

});
