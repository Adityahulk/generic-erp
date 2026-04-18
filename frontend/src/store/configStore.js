import { create } from 'zustand';
import api from '@/lib/api';

const useConfigStore = create((set, get) => ({
  config: null,
  terminology: {},
  modules: {},
  invoice_defaults: {},
  business_type: null,
  field_definitions: [],
  isLoaded: false,

  loadConfig: async () => {
    try {
      const { data } = await api.get('/config');
      set({
        config: data,
        terminology: data.terminology || {},
        modules: data.modules || {},
        invoice_defaults: data.invoice_defaults || {},
        business_type: data.business_type || null,
        field_definitions: data.field_definitions || [],
        isLoaded: true,
      });
    } catch {
      set({
        config: null,
        terminology: {},
        modules: {},
        invoice_defaults: {},
        business_type: null,
        field_definitions: [],
        isLoaded: true,
      });
    }
  },

  clearConfig: () =>
    set({
      config: null,
      terminology: {},
      modules: {},
      invoice_defaults: {},
      business_type: null,
      field_definitions: [],
      isLoaded: false,
    }),

  isModuleOn: (key) => {
    const m = get().modules || {};
    return m[key] !== false;
  },
}));

export default useConfigStore;
