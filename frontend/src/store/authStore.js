import { create } from 'zustand';
import api from '@/lib/api';
import useConfigStore from './configStore';

const useAuthStore = create((set, get) => ({
  user: null,
  company: null,
  token: localStorage.getItem('access_token') || null,
  company_id: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: ({ user, company, access_token, refresh_token }) => {
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    set({
      user,
      company: company || null,
      token: access_token,
      company_id: user.company_id,
      isAuthenticated: true,
    });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // proceed even if server call fails
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    useConfigStore.getState().clearConfig();
    set({
      user: null,
      company: null,
      token: null,
      company_id: null,
      isAuthenticated: false,
    });
  },

  fetchUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({
        user: data.user,
        company: data.company || null,
        company_id: data.user.company_id,
      });
      return data.user;
    } catch {
      get().logout();
      return null;
    }
  },

  setUser: (user) =>
    set({
      user,
      company_id: user.company_id,
    }),

  setCompany: (company) =>
    set({
      company,
    }),
}));

export default useAuthStore;
