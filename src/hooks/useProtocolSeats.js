import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiClient';
import { supabase } from '../lib/supabase';

export function useProtocolSeats(sessionId, optionsEnabled = true) {
  const queryClient = useQueryClient();

  const protocolSeatsQuery = useQuery({
    queryKey: ['protocol-seats', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data } = await api.get(`/sessions/${sessionId}/protocol-seats`);
      return data;
    },
    enabled: !!sessionId,
  });

  const protocolSeatOptionsQuery = useQuery({
    queryKey: ['protocol-seat-options', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const { data } = await api.get(`/sessions/${sessionId}/protocol-seat-options`);
      return data;
    },
    enabled: !!sessionId && optionsEnabled,
  });

  useEffect(() => {
    if (!sessionId) return undefined;

    const channel = supabase.channel(`public:protocol-seats:session_id=eq.${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'protocol_seats', filter: `session_id=eq.${sessionId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['protocol-seats', sessionId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, sessionId]);

  const createProtocolSeat = useMutation({
    mutationFn: async (data) => {
      const { data: result } = await api.post(`/sessions/${sessionId}/protocol-seats`, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol-seats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['protocol-seat-options', sessionId] });
    },
  });

  const updateProtocolSeat = useMutation({
    mutationFn: async ({ id, data }) => {
      const { data: result } = await api.patch(`/protocol-seats/${id}`, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol-seats', sessionId] });
    },
  });

  const deleteProtocolSeat = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/protocol-seats/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol-seats', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['protocol-seat-options', sessionId] });
    },
  });

  return {
    protocolSeatsQuery,
    protocolSeatOptionsQuery,
    createProtocolSeat,
    updateProtocolSeat,
    deleteProtocolSeat,
  };
}
