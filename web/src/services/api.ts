import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;

// --- Auth ---
export const login = (email: string, senha: string) =>
  api.post('/auth/login', { email, senha }).then((r) => r.data);

// --- Postos ---
export const getPostos = () => api.get('/postos').then((r) => r.data);
export const createPosto = (data: any) => api.post('/postos', data).then((r) => r.data);
export const updatePosto = (id: string, data: any) => api.put(`/postos/${id}`, data).then((r) => r.data);
export const deletePosto = (id: string) => api.delete(`/postos/${id}`).then((r) => r.data);

// --- Produtos ---
export const getProdutos = () => api.get('/produtos').then((r) => r.data);

// --- Bicos ---
export const getTodosBicos = () => api.get('/bicos').then((r) => r.data);
export const getBicosPorPosto = (posto_id: string) =>
  api.get(`/bicos/posto/${posto_id}`).then((r) => r.data);
export const updatePrecoBase = (id: string, preco_base: number) =>
  api.put(`/bicos/${id}/preco`, { preco_base }).then((r) => r.data);

// --- Descontos ---
export const getTodosDescontos = () => api.get('/descontos').then((r) => r.data);
export const getDescontosPorPosto = (posto_id: string) =>
  api.get(`/descontos/posto/${posto_id}`).then((r) => r.data);
export const setDesconto = (posto_id: string, produto_id: string, valor: number) =>
  api.put(`/descontos/posto/${posto_id}`, { produto_id, valor }).then((r) => r.data);

// --- Cartões ---
export const getCartoes = () => api.get('/cartoes').then((r) => r.data);
export const createCartao = (data: { codigo: string; nome_funcionario: string; posto_id: string }) =>
  api.post('/cartoes', data).then((r) => r.data);
export const renomearCartao = (id: string, nome_funcionario: string) =>
  api.put(`/cartoes/${id}/nome`, { nome_funcionario }).then((r) => r.data);
export const toggleCartao = (id: string, ativo: boolean) =>
  api.put(`/cartoes/${id}/status`, { ativo }).then((r) => r.data);
export const deleteCartao = (id: string) => api.delete(`/cartoes/${id}`).then((r) => r.data);

// --- Vendas ---
export const getVendas = (params?: { posto_id?: string; de?: string; ate?: string }) =>
  api.get('/vendas', { params }).then((r) => r.data);

// --- Auditoria ---
export const getAuditoria = (params?: { entidade?: string; limit?: number }) =>
  api.get('/auditoria', { params }).then((r) => r.data);

// --- Usuários ---
export const getUsuarios = () => api.get('/usuarios').then((r) => r.data);
export const createUsuario = (data: any) => api.post('/usuarios', data).then((r) => r.data);
export const toggleUsuario = (id: string, ativo: boolean) =>
  api.put(`/usuarios/${id}/status`, { ativo }).then((r) => r.data);
export const alterarSenhaUsuario = (id: string, senha: string) =>
  api.put(`/usuarios/${id}/senha`, { senha }).then((r) => r.data);
