import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiClient';
import { supabase } from '../lib/supabase';

export function useDirectoryDignitaries(enabled = true) {
  const queryClient = useQueryClient();

  const directoryQuery = useQuery({
    queryKey: ['directory-dignitaries'],
    queryFn: async () => {
      const { data } = await api.get('/directory-dignitaries/');
      return data;
    },
    enabled,
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const channel = supabase.channel('public:directory-dignitaries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dignitary_directory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['directory-dignitaries'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  const createDirectoryDignitary = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/directory-dignitaries/', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-dignitaries'] });
    },
  });

  const uploadDirectoryDignitaryPhoto = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/directory-dignitaries/upload-photo', formData);
      return data;
    },
  });

  const updateDirectoryDignitary = useMutation({
    mutationFn: async ({ id, data }) => {
      const { data: result } = await api.patch(`/directory-dignitaries/${id}`, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-dignitaries'] });
    },
  });

  const deleteDirectoryDignitary = useMutation({
    mutationFn: async (id) => {
      await api.delete(`/directory-dignitaries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory-dignitaries'] });
    },
  });

  return {
    directoryQuery,
    createDirectoryDignitary,
    uploadDirectoryDignitaryPhoto,
    updateDirectoryDignitary,
    deleteDirectoryDignitary,
  };
}

export function useConferenceDignitaries(confId, enabled = true) {
  const queryClient = useQueryClient();

  const conferenceDignitariesQuery = useQuery({
    queryKey: ['conference-dignitaries', confId],
    queryFn: async () => {
      if (!confId) return [];
      const { data } = await api.get(`/conferences/${confId}/dignitaries`);
      return data;
    },
    enabled: !!confId && enabled,
  });

  useEffect(() => {
    if (!confId || !enabled) return undefined;

    const channel = supabase.channel(`public:conference-dignitaries:${confId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conference_dignitaries', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['conference-dignitaries', confId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conference_protocol_assignments', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['conference-dignitaries', confId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [confId, enabled, queryClient]);

  const addConferenceDignitary = useMutation({
    mutationFn: async (directoryDignitaryId) => {
      const { data } = await api.post(`/conferences/${confId}/dignitaries`, {
        directory_dignitary_id: directoryDignitaryId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-dignitaries', confId] });
    },
  });

  const removeConferenceDignitary = useMutation({
    mutationFn: async (conferenceDignitaryId) => {
      await api.delete(`/dignitaries/conference-dignitaries/${conferenceDignitaryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conference-dignitaries', confId] });
    },
  });

  return {
    conferenceDignitariesQuery,
    addConferenceDignitary,
    removeConferenceDignitary,
  };
}
