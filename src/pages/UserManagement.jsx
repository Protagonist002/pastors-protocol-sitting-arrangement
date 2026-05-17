import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/auth-context';
import { Header } from '../components/Header';
import { FormField, Loader, RoleTag } from '../components/UI';
import { useConference, useConferenceProtocolAssignments, useConferences } from '../hooks/useConferences';
import { useConferenceDignitaries } from '../hooks/useDignitaryDirectory';
import { getInitials } from '../lib/formatters';
import { api } from '../services/apiClient';

export function UserManagement() {
  const { profile: currentUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [savingRoleId, setSavingRoleId] = useState(null);
  const [savingAssignmentId, setSavingAssignmentId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [draftConferenceRoles, setDraftConferenceRoles] = useState({});
  const [draftAssignedDignitaries, setDraftAssignedDignitaries] = useState({});
  const [appRolesOpen, setAppRolesOpen] = useState(true);
  const [conferenceRolesOpen, setConferenceRolesOpen] = useState(true);

  const { conferencesQuery } = useConferences();
  const { data: selectedConference } = useConference(selectedConferenceId);
  const { assignmentsQuery, updateAssignment } = useConferenceProtocolAssignments(selectedConferenceId);
  const { conferenceDignitariesQuery } = useConferenceDignitaries(selectedConferenceId);

  const { data: users = [], isLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users/');
      return data;
    },
    enabled: currentUser?.role === 'admin',
  });

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [selectedConferenceId]);

  useEffect(() => {
    const conferences = conferencesQuery.data || [];
    if (!conferences.length) {
      setSelectedConferenceId('');
      return;
    }

    const currentStillExists = conferences.some((conference) => conference.id === selectedConferenceId);
    if (!selectedConferenceId || !currentStillExists) {
      setSelectedConferenceId(conferences[0].id);
    }
  }, [conferencesQuery.data, selectedConferenceId]);

  useEffect(() => {
    if (!selectedConferenceId) {
      setDraftConferenceRoles({});
      setDraftAssignedDignitaries({});
      return;
    }

    const nextConferenceRoles = {};
    const nextAssignedDignitaries = {};
    (assignmentsQuery.data || []).forEach((assignment) => {
      nextConferenceRoles[assignment.user_id] = assignment.conference_role || '';
      nextAssignedDignitaries[assignment.user_id] = assignment.assigned_conference_dignitary_id || '';
    });
    setDraftConferenceRoles(nextConferenceRoles);
    setDraftAssignedDignitaries(nextAssignedDignitaries);
  }, [assignmentsQuery.data, selectedConferenceId]);

  const updateRole = async (userId, newRole) => {
    setSavingRoleId(userId);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      await refetchUsers();
      setSuccess('App role updated.');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to update role');
    } finally {
      setSavingRoleId(null);
    }
  };

  const saveAssignment = async (userId) => {
    setSavingAssignmentId(userId);
    setError('');
    setSuccess('');

    try {
      await updateAssignment.mutateAsync({
        userId,
        payload: {
          conference_role: draftConferenceRoles[userId]?.trim() || null,
          assigned_conference_dignitary_id: draftAssignedDignitaries[userId] || null,
        },
      });
      setSuccess('Conference assignment updated.');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to update assignment');
    } finally {
      setSavingAssignmentId(null);
    }
  };

  const deleteProtocolUser = async (user) => {
    if (user.role !== 'protocol') return;
    if (!window.confirm(`Delete ${user.full_name || 'this protocol user'} from the app? This removes their access assignments and profile.`)) {
      return;
    }

    setDeletingUserId(user.id);
    setError('');
    setSuccess('');

    try {
      await api.delete(`/users/${user.id}`);
      await refetchUsers();
      setSuccess('Protocol user deleted.');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete protocol user');
    } finally {
      setDeletingUserId(null);
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div>
        <Header backTo="/" backLabel="Dashboard" />
        <div className="page-container">
          <p style={{ color: 'var(--danger-strong)' }}>Access denied. Admin only.</p>
        </div>
      </div>
    );
  }

  const conferences = conferencesQuery.data || [];
  const conferenceDignitaries = conferenceDignitariesQuery.data || [];
  const protocolUsers = users.filter((user) => user.role === 'protocol');
  const assignmentsError =
    assignmentsQuery.error?.response?.data?.detail
    || assignmentsQuery.error?.message
    || '';
  const conferenceAssignmentsLoading =
    Boolean(selectedConferenceId)
    && (assignmentsQuery.isLoading || conferenceDignitariesQuery.isLoading);
  const conferenceSummary = selectedConference
    ? [
        selectedConference.auditorium?.name ? `Auditorium: ${selectedConference.auditorium.name}` : null,
        `Dignitary count: ${conferenceDignitariesQuery.isLoading ? '...' : conferenceDignitaries.length}`,
      ].filter(Boolean).join(' | ')
    : '';

  return (
    <div>
      <Header backTo="/" backLabel="Dashboard" />
      <div className="page-container fade-in">
        <div className="page-header page-header--start">
          <div>
            <h1 className="page-title">Manage Access</h1>
          </div>
        </div>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-error" style={{ color: 'var(--success-strong)' }}>{success}</p>}

        {isLoading ? (
          <Loader text="Loading users..." />
        ) : (
          <>
            <section className="card section-card">
              <button
                className={`section-card-toggle ${conferenceRolesOpen ? 'open' : ''}`}
                type="button"
                onClick={() => setConferenceRolesOpen((prev) => !prev)}
                aria-expanded={conferenceRolesOpen}
              >
                <div className="section-card-head">
                  <div>
                    <h2 className="section-card-title">Conference Roles</h2>
                  </div>
                  <span className="section-card-toggle-icon" aria-hidden="true">
                    <ChevronDown size={18} />
                  </span>
                </div>
              </button>

              {conferenceRolesOpen && (
                <div className="section-card-body">
                  {!conferences.length ? (
                    <div className="empty-state profile-page-empty">
                      <div className="empty-state-icon">Conference</div>
                      <p className="empty-state-text">No conferences available yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="tab-bar tab-bar--wrap">
                        {conferences.map((conference) => (
                          <button
                            key={conference.id}
                            type="button"
                            onClick={() => setSelectedConferenceId(conference.id)}
                            className={`tab-btn ${selectedConferenceId === conference.id ? 'active' : ''}`}
                          >
                            {conference.name}
                          </button>
                        ))}
                      </div>

                      {conferenceSummary && (
                        <p className="page-description" style={{ marginBottom: 18 }}>
                          {conferenceSummary}
                        </p>
                      )}

                      {!selectedConferenceId && conferences.length > 0 && (
                        <div className="empty-state">
                          <div className="empty-state-icon">Conference</div>
                          <p className="empty-state-text">Select a conference first.</p>
                        </div>
                      )}

                      {selectedConferenceId && assignmentsError && (
                        <p className="auth-error">{assignmentsError}</p>
                      )}

                      {conferenceAssignmentsLoading && (
                        <div className="inline-loading-state" role="status" aria-live="polite">
                          <Loader2 className="loader-spin" size={18} />
                          <span>Loading conference roles...</span>
                        </div>
                      )}

                      {selectedConferenceId && !assignmentsError && !conferenceAssignmentsLoading && protocolUsers.length > 0 && (
                        <div className="grid-cards">
                          {protocolUsers.map((user) => {
                            const assignedDignitaryId = draftAssignedDignitaries[user.id] || '';
                            const conferenceRole = draftConferenceRoles[user.id] || '';

                            return (
                              <div key={`${selectedConferenceId}-${user.id}`} className="card user-admin-card">
                                <div className="attendee-card-top">
                                  <div className="attendee-avatar">
                                    {user.picture_url ? <img src={user.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(user.full_name, '?')}
                                  </div>
                                  <div className="attendee-info">
                                    <div className="attendee-name">{user.full_name || 'Unnamed'}</div>
                                    <div className="attendee-title">{user.extension || 'No GLT extension yet'}</div>
                                    <RoleTag role={user.role} />
                                  </div>
                                </div>

                                <FormField label="Conference Role">
                                  <input
                                    className="input"
                                    placeholder="e.g. Arrival Desk"
                                    value={conferenceRole}
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      setDraftConferenceRoles((prev) => ({ ...prev, [user.id]: nextValue }));
                                    }}
                                  />
                                </FormField>

                                <FormField label="Assigned Dignitary">
                                  <select
                                    className="input"
                                    value={assignedDignitaryId}
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      setDraftAssignedDignitaries((prev) => ({ ...prev, [user.id]: nextValue }));
                                    }}
                                  >
                                    <option value="">No dignitary assigned</option>
                                    {conferenceDignitaries.map((dignitary) => (
                                      <option key={dignitary.id} value={dignitary.id}>
                                        {dignitary.name} - {dignitary.title}
                                      </option>
                                    ))}
                                  </select>
                                </FormField>

                                <div className="form-actions">
                                  <button className="btn btn-outline" type="button" onClick={() => navigate(`/users/${user.id}`)}>
                                    Open Profile
                                  </button>
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => saveAssignment(user.id)}
                                    disabled={savingAssignmentId === user.id}
                                  >
                                    {savingAssignmentId === user.id ? 'Saving...' : 'Save Assignment'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {selectedConferenceId && !conferenceAssignmentsLoading && !assignmentsError && protocolUsers.length === 0 && (
                        <p className="page-subtitle">No protocol officers are available to assign for this conference yet.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="card section-card section-gap-top">
              <button
                className={`section-card-toggle ${appRolesOpen ? 'open' : ''}`}
                type="button"
                onClick={() => setAppRolesOpen((prev) => !prev)}
                aria-expanded={appRolesOpen}
              >
                <div className="section-card-head">
                  <div>
                    <h2 className="section-card-title">App Roles</h2>
                  </div>
                  <span className="section-card-toggle-icon" aria-hidden="true">
                    <ChevronDown size={18} />
                  </span>
                </div>
              </button>

              {appRolesOpen && (
                <div className="section-card-body">
                  {users.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">Users</div>
                      <p className="empty-state-text">No users found.</p>
                    </div>
                  ) : (
                    <div className="grid-cards">
                      {users.map((user) => (
                        <div key={`role-${user.id}`} className="card user-admin-card">
                          <div className="attendee-card-top">
                            <div className="attendee-avatar">
                              {user.picture_url ? <img src={user.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(user.full_name, '?')}
                            </div>
                            <div className="attendee-info">
                              <div className="attendee-name">{user.full_name || 'Unnamed'}</div>
                              <div className="attendee-title">{user.extension || 'No GLT extension yet'}</div>
                              <RoleTag role={user.role} />
                            </div>
                          </div>

                          <FormField label="App Role">
                            {user.id === currentUser?.id ? (
                              <div className="page-subtitle">You cannot change your own role.</div>
                            ) : (
                              <select className="input" value={user.role} onChange={(e) => updateRole(user.id, e.target.value)} disabled={savingRoleId === user.id}>
                                <option value="protocol">Protocol</option>
                                <option value="editor">Editor</option>
                                <option value="admin">Admin</option>
                              </select>
                            )}
                          </FormField>

                          <div className="form-actions">
                            <button className="btn btn-outline" type="button" onClick={() => navigate(`/users/${user.id}`)}>
                              View Profile
                            </button>
                            {user.role === 'protocol' && user.id !== currentUser?.id && (
                              <button
                                className="btn btn-ghost"
                                type="button"
                                style={{ color: 'var(--danger-strong)' }}
                                onClick={() => deleteProtocolUser(user)}
                                disabled={deletingUserId === user.id}
                              >
                                {deletingUserId === user.id ? 'Deleting...' : 'Delete Protocol'}
                              </button>
                            )}
                          </div>

                          {savingRoleId === user.id ? <div className="page-subtitle">Saving...</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
