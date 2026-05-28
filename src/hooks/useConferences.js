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

function buildConferenceFallbackPayload(payload, error) {
  const fallbackPayload = { ...payload };
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(payload, 'time') && errorMatchesMissingField(error, 'conferences', 'time')) {
    delete fallbackPayload.time;
    changed = true;
  }

  if (
    (Object.prototype.hasOwnProperty.call(payload, 'start_date') || Object.prototype.hasOwnProperty.call(payload, 'end_date'))
    && (
      errorMatchesMissingField(error, 'conferences', 'start_date')
      || errorMatchesMissingField(error, 'conferences', 'end_date')
    )
  ) {
    delete fallbackPayload.start_date;
    delete fallbackPayload.end_date;
    changed = true;
  }

  return changed ? fallbackPayload : null;
}

export function useConferences() {
  const queryClient = useQueryClient();

  const conferencesQuery = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const { data } = await api.get('/conferences/');
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase.channel('public:conferences')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferences' }, () => {
        queryClient.invalidateQueries({ queryKey: ['conferences'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createConference = useMutation({
    mutationFn: async (newConf) => {
      try {
        const { data } = await api.post('/conferences/', newConf);
        return data;
      } catch (error) {
        const fallbackPayload = buildConferenceFallbackPayload(newConf, error);
        if (fallbackPayload) {
          const { data } = await api.post('/conferences/', fallbackPayload);
          return data;
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
    },
  });

  const updateConference = useMutation({
    mutationFn: async ({ id, data }) => {
      try {
        const { data: result } = await api.patch(`/conferences/${id}`, data);
        return result;
      } catch (error) {
        const fallbackPayload = buildConferenceFallbackPayload(data, error);
        if (fallbackPayload) {
          const { data: result } = await api.patch(`/conferences/${id}`, fallbackPayload);
          return result;
        }
        throw error;
      }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      queryClient.invalidateQueries({ queryKey: ['conference', id] });
    },
  });

  const deleteConference = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/conferences/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
    },
  });

  return {
    conferencesQuery,
    createConference,
    updateConference,
    deleteConference,
  };
}

export function useConference(confId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!confId) return undefined;

    const channel = supabase.channel(`public:conference:${confId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferences', filter: `id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['conference', confId] });
        queryClient.invalidateQueries({ queryKey: ['conferences'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [confId, queryClient]);

  return useQuery({
    queryKey: ['conference', confId],
    queryFn: async () => {
      if (!confId) return null;
      const { data } = await api.get(`/conferences/${confId}`);
      return data;
    },
    enabled: !!confId,
  });
}

export function useConferenceProtocolAssignments(confId, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!confId) return undefined;

    const channel = supabase.channel(`public:conference-protocol-assignments:${confId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conference_protocol_assignments', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['conference-protocol-assignments', confId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [confId, queryClient]);

  const assignmentsQuery = useQuery({
    queryKey: ['conference-protocol-assignments', confId],
    queryFn: async () => {
      if (!confId) return [];
      const { data } = await api.get(`/conferences/${confId}/protocol-assignments`);
      return data;
    },
    enabled: !!confId && enabled,
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ userId, payload }) => {
      const { data } = await api.put(`/conferences/${confId}/protocol-assignments/${userId}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-protocol-assignments', confId] });
      queryClient.invalidateQueries({ queryKey: ['conference-dignitaries', confId] });
    },
  });

  const exportArrivals = async () => {
    const response = await api.get(`/conferences/${confId}/arrival-export`, {
      responseType: 'blob',
    });
    return response.data;
  };

  return {
    assignmentsQuery,
    updateAssignment,
    exportArrivals,
  };
}
