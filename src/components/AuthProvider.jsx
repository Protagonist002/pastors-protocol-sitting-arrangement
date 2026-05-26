import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/apiClient';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (attempt = 0) => {
    try {
      const { data } = await api.get('/users/me');
      setProfile(data || null);
    } catch (err) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        return fetchProfile(attempt + 1);
      }
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user || null);
      if (currentSession?.user) fetchProfile();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user || null);
      if (currentSession?.user) fetchProfile();
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const channel = supabase.channel(`profile-sync:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, () => {
        fetchProfile();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conference_protocol_assignments', filter: `user_id=eq.${user.id}` }, () => {
        fetchProfile();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProfile, user?.id]);

  const reloadProfile = async () => {
    if (user) {
      await fetchProfile();
    }
  };

  const managedConferenceDignitaryIds = profile?.managed_conference_dignitary_ids || [];

  const val = {
    session,
    user,
    profile,
    loading,
    reloadProfile,
    role: profile?.role || null,
    managedConferenceDignitaryIds,
    canManageConferenceDignitary: (conferenceDignitaryId) =>
      profile?.role === 'admin' || managedConferenceDignitaryIds.includes(conferenceDignitaryId),
    isEditorOrAdmin: profile?.role === 'admin' || profile?.role === 'editor',
    isAdmin: profile?.role === 'admin',
  };

  return <AuthContext.Provider value={val}>{children}</AuthContext.Provider>;
}
