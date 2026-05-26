import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiClient';
import { supabase } from '../lib/supabase';
import { buildControlCenterModel } from '../lib/controlCenter';

async function fetchControlCenterData(confId) {
  if (!confId) {
    return {
      conference: null,
      sessions: [],
      roster: [],
      assignments: [],
      users: [],
      sessionDignitariesBySessionId: {},
    };
  }

  const [
    conferenceResponse,
    sessionsResponse,
    rosterResponse,
    assignmentsResponse,
    usersResponse,
  ] = await Promise.all([
    api.get(`/conferences/${confId}`),
    api.get(`/conferences/${confId}/sessions`),
    api.get(`/conferences/${confId}/dignitaries`),
    api.get(`/conferences/${confId}/protocol-assignments`),
    api.get('/users/'),
  ]);

  const sessions = sessionsResponse.data || [];
  const sessionDignitaryPairs = await Promise.all(
    sessions.map(async (session) => {
      const { data } = await api.get(`/sessions/${session.id}/dignitaries`);
      return [session.id, data || []];
    }),
  );

  return {
    conference: conferenceResponse.data,
    sessions,
    roster: rosterResponse.data || [],
    assignments: assignmentsResponse.data || [],
    users: usersResponse.data || [],
    sessionDignitariesBySessionId: Object.fromEntries(sessionDignitaryPairs),
  };
}

export function useControlCenter(confId, enabled = true) {
  const queryClient = useQueryClient();

  const controlQuery = useQuery({
    queryKey: ['control-center', confId],
    queryFn: () => fetchControlCenterData(confId),
    enabled: Boolean(confId) && enabled,
    refetchInterval: 30_000,
  });

  const sessionIds = useMemo(
    () => (controlQuery.data?.sessions || []).map((session) => session.id),
    [controlQuery.data?.sessions],
  );

  useEffect(() => {
    if (!confId || !enabled) return undefined;

    const channel = supabase.channel(`control-center:${confId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conferences', filter: `id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['control-center', confId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['control-center', confId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conference_dignitaries', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['control-center', confId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conference_protocol_assignments', filter: `conference_id=eq.${confId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['control-center', confId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['control-center', confId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [confId, enabled, queryClient]);

  useEffect(() => {
    if (!confId || !enabled || sessionIds.length === 0) return undefined;

    const channel = supabase.channel(`control-center-dignitaries:${confId}`);
    sessionIds.forEach((sessionId) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'dignitaries', filter: `session_id=eq.${sessionId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['control-center', confId] });
      });
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [confId, enabled, queryClient, sessionIds]);

  const model = useMemo(() => {
    if (!controlQuery.data) return null;
    return buildControlCenterModel(controlQuery.data);
  }, [controlQuery.data]);

  return {
    ...controlQuery,
    model,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['control-center', confId] }),
  };
}
