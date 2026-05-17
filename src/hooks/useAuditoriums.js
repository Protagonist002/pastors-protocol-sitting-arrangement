import { useQuery } from '@tanstack/react-query';
import { api } from '../services/apiClient';

export function useAuditoriums(enabled = true) {
  return useQuery({
    queryKey: ['auditoriums'],
    queryFn: async () => {
      const { data } = await api.get('/auditoriums/');
      return data;
    },
    enabled,
  });
}
