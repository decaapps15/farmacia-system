// Configuración de Supabase
const SUPABASE_URL = 'https://gbypnqhpmtpojqnafjhg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_I9BjL0iF5f3p0xIOKGNAzw_mf-87NBY';

// Inicializar cliente Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar para uso en otros módulos
window.supabaseClient = supabase;

// Verificar sesión al cargar
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session && window.location.pathname.includes('index.html')) {
        window.location.href = 'dashboard.html';
    }
    
    // Escuchar cambios de autenticación
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && window.location.pathname.includes('index.html')) {
            window.location.href = 'dashboard.html';
        }
        
        if (event === 'SIGNED_OUT') {
            window.location.href = 'index.html';
        }
    });
});

// Utilidades de Supabase
const db = {
    // Obtener información del empleado logueado
    async getCurrentEmployee() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        const { data, error } = await supabase
            .from('empleados')
            .select('*')
            .eq('user_id', user.id)
            .single();
            
        if (error) throw error;
        return data;
    },
    
    // Ejecutar consulta segura con reintentos
    async query(table, method = 'select', params = {}) {
        try {
            let query = supabase.from(table);
            
            switch (method) {
                case 'select':
                    query = query.select(params.select || '*');
                    if (params.where) {
                        for (const [key, value] of Object.entries(params.where)) {
                            query = query.eq(key, value);
                        }
                    }
                    if (params.order) {
                        query = query.order(params.order.column, { 
                            ascending: params.order.ascending 
                        });
                    }
                    if (params.limit) {
                        query = query.limit(params.limit);
                    }
                    break;
                    
                case 'insert':
                    query = query.insert(params.data);
                    break;
                    
                case 'update':
                    query = query.update(params.data);
                    if (params.where) {
                        for (const [key, value] of Object.entries(params.where)) {
                            query = query.eq(key, value);
                        }
                    }
                    break;
                    
                case 'delete':
                    query = query.delete();
                    if (params.where) {
                        for (const [key, value] of Object.entries(params.where)) {
                            query = query.eq(key, value);
                        }
                    }
                    break;
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return data;
            
        } catch (error) {
            console.error(`Error en ${method} ${table}:`, error);
            throw error;
        }
    }
};


window.db = db;
