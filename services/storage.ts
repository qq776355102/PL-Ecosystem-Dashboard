
import { AddressInfo } from '../types';

const STORAGE_KEY = 'POLYGON_DASHBOARD_DATA';

export const storage = {
  saveData: (data: AddressInfo[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  
  loadData: (): AddressInfo[] | null => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },
  
  clearData: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  exportToJSON: (data: AddressInfo[]) => {
    const blob = new Blob([JSON.stringify({ items: data, generatedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polygon-dashboard-export-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
