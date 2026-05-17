import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiClient';
import { supabase } from '../lib/supabase';

function errorMatchesMissingField(error, relationName, fieldName) {
  const detail = error?.response?.data?.detail;
  const message = typeof detail === 'string' ? detail : JSON.stringify(detail || error?.message || '');
  const haystack = message.toLowerCase();
  return haystack.includes(relationName.toLowerCase()) && haystack.includes(fieldName.toLowerCase());
}

export function useSessions(confId) {
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['sessions', confId],
    queryFn: async () => {
      if (!confId) return [];
      const { data } = await api.get(`/conferences/${confId}/sessions`);
      return data;
    },
    enabled: !!confId,
  });

  useEffect(() => {
    if (!confId) return undefined;

    const channel = supabase.channel(`public:sessions:${confId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sessions', confId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [confId, queryClient]);

  const createSession = useMutation({
    mutationFn: async (newSess) => {
      try {
        const { data } = await api.post(`/conferences/${confId}/sessions`, newSess);
        return data;
      } catch (error) {
        if (Object.prototype.hasOwnProperty.call(newSess, 'time') && errorMatchesMissingField(error, 'sessions', 'time')) {
          const { time, ...fallbackPayload } = newSess;
          const { data } = await api.post(`/conferences/${confId}/sessions`, fallbackPayload);
          return data;
        }
        throw error;
      }
    },
    onSuccess: () => {
      if (confId) queryClient.invalidateQueries({ queryKey: ['sessions', confId] });
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
    },
  });

  const updateSession = useMutation({
    mutationFn: async ({ id, data }) => {
      try {
        const { data: result } = await api.patch(`/sessions/${id}`, data);
        return result;
      } catch (error) {
        if (Object.prototype.hasOwnProperty.call(data, 'time') && errorMatchesMissingField(error, 'sessions', 'time')) {
          const { time, ...fallbackPayload } = data;
          const { data: result } = await api.patch(`/sessions/${id}`, fallbackPayload);
          return result;
        }
        throw error;
      }
    },
    onSuccess: () => {
      if (confId) queryClient.invalidateQueries({ queryKey: ['sessions', confId] });
    },
  });

  const updateSeatingConfig = useMutation({
    mutationFn: async ({ sessionId, config }) => {
      const { data } = await api.patch(`/sessions/${sessionId}/seating-config`, config);
      return data;
    },
    onSuccess: (_, { sessionId }) => {
      if (confId) queryClient.invalidateQueries({ queryKey: ['sessions', confId] });
      if (sessionId) queryClient.invalidateQueries({ queryKey: ['sessionData', sessionId] });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/sessions/${id}`);
    },
    onSuccess: () => {
      if (confId) queryClient.invalidateQueries({ queryKey: ['sessions', confId] });
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
    },
  });

  return {
    sessionsQuery,
    createSession,
    updateSession,
    updateSeatingConfig,
    deleteSession,
  };
}

export function useSession(sessionId) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const { data } = await api.get(`/sessions/${sessionId}`);
      return data;
    },
    enabled: !!sessionId,
  });
}

export function useSessionData(sessionId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return undefined;

    const channel = supabase.channel(`public:session:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sessionData', sessionId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  return useQuery({
    queryKey: ['sessionData', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const { data: session } = await api.get(`/sessions/${sessionId}`);
      if (!session) return null;
      return {
        session,
        conf: session.conference || null,
      };
    },
    enabled: !!sessionId,
  });
}
