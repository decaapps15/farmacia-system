// utils.js - Utilidades generales para el sistema
class Utils {
    constructor() {
        this.init();
    }

    init() {
        // Inicializar utilidades comunes
        this.setupGlobalEventListeners();
        this.initClipboard();
    }

    // Formatear fecha
    formatDate(date, format = 'full') {
        const d = new Date(date);
        
        if (format === 'full') {
            return d.toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (format === 'date') {
            return d.toLocaleDateString('es-ES');
        }
        
        if (format === 'time') {
            return d.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (format === 'short') {
            return d.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
        
        return d.toLocaleString('es-ES');
    }

    // Formatear moneda
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // Validar email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validar DNI
    isValidDNI(dni) {
        const dniRegex = /^\d{8}[A-Z]$/i;
        if (!dniRegex.test(dni)) return false;
        
        const letter = dni.slice(-1).toUpperCase();
        const numbers = parseInt(dni.slice(0, -1));
        const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
        const expectedLetter = letters[numbers % 23];
        
        return letter === expectedLetter;
    }

    // Generar código único
    generateUniqueCode(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `${prefix}${timestamp}-${random}`.toUpperCase();
    }

    // Mostrar modal
    showModal(title, content, options = {}) {
        const modalId = options.id || `modal-${Date.now()}`;
        const modalHtml = `
            <div class="modal-overlay" id="${modalId}">
                <div class="modal-dialog">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="window.utils.closeModal('${modalId}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-content">
                        ${content}
                    </div>
                    ${options.footer ? `
                        <div class="modal-footer">
                            ${options.footer}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        const modalContainer = document.getElementById('modalContainer') || document.body;
        modalContainer.insertAdjacentHTML('beforeend', modalHtml);

        // Añadir estilos si no existen
        if (!document.getElementById('modal-styles')) {
            const styles = `
                <style>
                    .modal-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1050;
                        padding: 20px;
                        animation: fadeIn 0.3s ease;
                    }
                    
                    .modal-dialog {
                        background: white;
                        border-radius: 12px;
                        max-width: 500px;
                        width: 100%;
                        max-height: 90vh;
                        overflow-y: auto;
                        animation: slideUp 0.3s ease;
                    }
                    
                    .modal-header {
                        padding: 20px;
                        border-bottom: 1px solid #eee;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .modal-header h3 {
                        margin: 0;
                        color: #333;
                    }
                    
                    .modal-close {
                        background: none;
                        border: none;
                        font-size: 1.2rem;
                        color: #777;
                        cursor: pointer;
                        padding: 5px;
                    }
                    
                    .modal-close:hover {
                        color: #333;
                    }
                    
                    .modal-content {
                        padding: 20px;
                    }
                    
                    .modal-footer {
                        padding: 20px;
                        border-top: 1px solid #eee;
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    }
                    
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    
                    @keyframes slideUp {
                        from {
                            opacity: 0;
                            transform: translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    
                    @keyframes fadeOut {
                        from { opacity: 1; }
                        to { opacity: 0; }
                    }
                </style>
            `;
            document.head.insertAdjacentHTML('beforeend', styles);
        }

        return modalId;
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                if (modal && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }, 300);
        }
    }

    // Mostrar confirmación
    async showConfirm(title, message, options = {}) {
        return new Promise((resolve) => {
            const confirmId = this.generateUniqueCode('confirm');
            const confirmHtml = `
                <div class="confirm-dialog">
                    <h4>${title}</h4>
                    <p>${message}</p>
                    <div class="confirm-buttons">
                        <button class="btn btn-secondary" onclick="window.utils.handleConfirm('${confirmId}', false)">
                            ${options.cancelText || 'Cancelar'}
                        </button>
                        <button class="btn btn-primary" onclick="window.utils.handleConfirm('${confirmId}', true)">
                            ${options.okText || 'Aceptar'}
                        </button>
                    </div>
                </div>
            `;

            const modalId = this.showModal(title, confirmHtml, {
                id: confirmId,
                footer: ''
            });

            // Guardar referencia global para el handler
            window.utils = this;
            this.handleConfirm = (id, result) => {
                this.closeModal(id);
                resolve(result);
            };
        });
    }

    // Handler para confirmaciones
    handleConfirm(id, result) {
        this.closeModal(id);
        // La promesa se resuelve en showConfirm
    }

    // Cargar datos con caché
    async fetchWithCache(url, options = {}, cacheTime = 300000) {
        const cacheKey = `cache_${btoa(url)}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < cacheTime) {
                return data;
            }
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            // Guardar en caché
            localStorage.setItem(cacheKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
            
            return data;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    // Mostrar notificación
    showNotification(message, type = 'info', duration = 3000) {
        const notificationId = `notification-${Date.now()}`;
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const notificationHtml = `
            <div class="notification notification-${type}" id="${notificationId}">
                <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        const notificationContainer = document.getElementById('notifications') || (() => {
            const container = document.createElement('div');
            container.id = 'notifications';
            container.className = 'notifications-container';
            document.body.appendChild(container);
            return container;
        })();

        notificationContainer.insertAdjacentHTML('beforeend', notificationHtml);
        
        // Añadir estilos si no existen
        if (!document.getElementById('notification-styles')) {
            const styles = `
                <style>
                    .notifications-container {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 1080;
                    }
                    
                    .notification {
                        padding: 15px 20px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 10px;
                        animation: slideInRight 0.3s ease;
                        border-left: 4px solid;
                    }
                    
                    .notification-success {
                        border-left-color: #27ae60;
                    }
                    
                    .notification-success i {
                        color: #27ae60;
                    }
                    
                    .notification-error {
                        border-left-color: #e74c3c;
                    }
                    
                    .notification-error i {
                        color: #e74c3c;
                    }
                    
                    .notification-warning {
                        border-left-color: #f39c12;
                    }
                    
                    .notification-warning i {
                        color: #f39c12;
                    }
                    
                    .notification-info {
                        border-left-color: #3498db;
                    }
                    
                    .notification-info i {
                        color: #3498db;
                    }
                    
                    @keyframes slideInRight {
                        from {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateX(0);
                            opacity: 1;
                        }
                    }
                    
                    @keyframes slideOutRight {
                        from {
                            transform: translateX(0);
                            opacity: 1;
                        }
                        to {
                            transform: translateX(100%);
                            opacity: 0;
                        }
                    }
                </style>
            `;
            document.head.insertAdjacentHTML('beforeend', styles);
        }

        // Auto-remover después de la duración
        setTimeout(() => {
            const notification = document.getElementById(notificationId);
            if (notification) {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => {
                    if (notification && notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, duration);

        return notificationId;
    }

    // Debounce para eventos
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle para eventos
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Copiar al portapapeles
    copyToClipboard(text) {
        return new Promise((resolve, reject) => {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text)
                    .then(() => {
                        this.showNotification('Copiado al portapapeles', 'success');
                        resolve(true);
                    })
                    .catch(err => {
                        console.error('Clipboard API error:', err);
                        this.copyFallback(text);
                        resolve(true);
                    });
            } else {
                this.copyFallback(text);
                resolve(true);
            }
        });
    }

    // Fallback para copiar
    copyFallback(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showNotification('Copiado al portapapeles', 'success');
        } catch (err) {
            console.error('Fallback copy error:', err);
            this.showNotification('Error al copiar', 'error');
        } finally {
            textarea.remove();
        }
    }

    // Inicializar clipboard
    initClipboard() {
        document.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy]');
            if (copyBtn) {
                e.preventDefault();
                const text = copyBtn.getAttribute('data-copy') || 
                             copyBtn.textContent.trim();
                this.copyToClipboard(text);
            }
        });
    }

    // Formatear número de teléfono
    formatPhoneNumber(phone) {
        const cleaned = ('' + phone).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return '(' + match[1] + ') ' + match[2] + '-' + match[3];
        }
        return phone;
    }

    // Validar número de teléfono
    isValidPhoneNumber(phone) {
        const phoneRegex = /^\+?(\d{1,4})?[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/;
        return phoneRegex.test(phone);
    }

    // Formatear número con separadores de miles
    formatNumber(number, decimals = 0) {
        return new Intl.NumberFormat('es-ES', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }

    // Calcular edad desde fecha de nacimiento
    calculateAge(birthDate) {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    }

    // Obtener parámetros de URL
    getUrlParams() {
        const params = {};
        const queryString = window.location.search.slice(1);
        const pairs = queryString.split('&');
        
        for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key) {
                params[decodeURIComponent(key)] = decodeURIComponent(value || '');
            }
        }
        
        return params;
    }

    // Crear parámetros de URL
    createUrlParams(params) {
        return Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
    }

    // Descargar archivo
    downloadFile(data, filename, type = 'text/plain') {
        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Exportar a CSV
    exportToCSV(data, filename = 'export.csv') {
        if (!data || !data.length) return;
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escapar comas y comillas
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');
        
        this.downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
    }

    // Exportar a JSON
    exportToJSON(data, filename = 'export.json') {
        const jsonContent = JSON.stringify(data, null, 2);
        this.downloadFile(jsonContent, filename, 'application/json');
    }

    // Leer archivo
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (e) => {
                reject(new Error('Error reading file'));
            };
            
            if (file.type.includes('text') || file.type.includes('json') || file.type.includes('csv')) {
                reader.readAsText(file);
            } else {
                reader.readAsDataURL(file);
            }
        });
    }

    // Validar archivo
    validateFile(file, options = {}) {
        const { maxSize = 10 * 1024 * 1024, allowedTypes = [] } = options;
        
        if (file.size > maxSize) {
            return {
                valid: false,
                error: `El archivo excede el tamaño máximo de ${maxSize / 1024 / 1024}MB`
            };
        }
        
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
            return {
                valid: false,
                error: `Tipo de archivo no permitido. Tipos permitidos: ${allowedTypes.join(', ')}`
            };
        }
        
        return { valid: true };
    }

    // Setup event listeners globales
    setupGlobalEventListeners() {
        // Prevent form submission on enter in non-submit contexts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.type.includes('submit')) {
                const form = e.target.closest('form');
                if (form && !form.querySelector('[type="submit"]')) {
                    e.preventDefault();
                }
            }
        });

        // Handle escape key for modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modals = document.querySelectorAll('.modal-overlay');
                if (modals.length > 0) {
                    const lastModal = modals[modals.length - 1];
                    this.closeModal(lastModal.id);
                }
            }
        });
    }

    // Obtener diferencia de tiempo relativa
    getRelativeTime(date) {
        const now = new Date();
        const target = new Date(date);
        const diffMs = now - target;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) {
            return 'hace unos segundos';
        } else if (diffMin < 60) {
            return `hace ${diffMin} minuto${diffMin > 1 ? 's' : ''}`;
        } else if (diffHour < 24) {
            return `hace ${diffHour} hora${diffHour > 1 ? 's' : ''}`;
        } else if (diffDay < 7) {
            return `hace ${diffDay} día${diffDay > 1 ? 's' : ''}`;
        } else {
            return this.formatDate(date, 'short');
        }
    }

    // Capitalizar texto
    capitalize(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    // Truncar texto
    truncate(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    // Generar color aleatorio
    getRandomColor() {
        const colors = [
            '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
            '#1abc9c', '#d35400', '#c0392b', '#16a085', '#8e44ad'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Crear avatar con iniciales
    createAvatar(name, size = 40) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Color de fondo
        ctx.fillStyle = this.getRandomColor();
        ctx.fillRect(0, 0, size, size);
        
        // Iniciales
        const initials = name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
        
        // Texto
        ctx.fillStyle = 'white';
        ctx.font = `${size / 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, size / 2, size / 2);
        
        return canvas.toDataURL();
    }

    // Validar formulario
    validateForm(formData, rules) {
        const errors = {};
        
        for (const [field, value] of Object.entries(formData)) {
            const rule = rules[field];
            if (!rule) continue;
            
            // Validación requerida
            if (rule.required && !value) {
                errors[field] = rule.requiredMessage || 'Este campo es requerido';
                continue;
            }
            
            // Validación de patrón
            if (rule.pattern && value) {
                const regex = new RegExp(rule.pattern);
                if (!regex.test(value)) {
                    errors[field] = rule.patternMessage || 'Formato inválido';
                    continue;
                }
            }
            
            // Validación de longitud mínima
            if (rule.minLength && value && value.length < rule.minLength) {
                errors[field] = rule.minLengthMessage || `Mínimo ${rule.minLength} caracteres`;
                continue;
            }
            
            // Validación de longitud máxima
            if (rule.maxLength && value && value.length > rule.maxLength) {
                errors[field] = rule.maxLengthMessage || `Máximo ${rule.maxLength} caracteres`;
                continue;
            }
        }
        
        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    // Sanitizar HTML
    sanitizeHTML(html) {
        const temp = document.createElement('div');
        temp.textContent = html;
        return temp.innerHTML;
    }
}

// Inicializar utils globalmente
document.addEventListener('DOMContentLoaded', () => {
    window.utils = new Utils();
});

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}