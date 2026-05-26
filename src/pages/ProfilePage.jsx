import { PencilLine } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { useAuth } from '../components/auth-context';
import { FormField, Loader } from '../components/UI';
import { useConferences } from '../hooks/useConferences';
import { getInitials } from '../lib/formatters';
import { api } from '../services/apiClient';

function DetailCell({ label, value }) {
  return (
    <div className="profile-detail-cell">
      <div className="profile-detail-label">{label}</div>
      <div className="profile-detail-value">{value || 'Not available'}</div>
    </div>
  );
}

function getRoleLabel(role) {
  const labels = {
    admin: 'Administrator',
    editor: 'Editor',
    protocol: 'protocol',
  };
  return labels[role] || 'Not available';
}

export function ProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user, reloadProfile, isAdmin } = useAuth();
  const { conferencesQuery } = useConferences();
  const isOwnProfile = !userId;
  const [formState, setFormState] = useState({ full_name: '', extension: '', picture_url: '' });
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    if (userId && !isAdmin) {
      navigate('/profile', { replace: true });
    }
  }, [isAdmin, navigate, userId]);

  const profileQuery = useQuery({
    queryKey: ['profile-page', isOwnProfile ? 'me' : userId],
    queryFn: async () => {
      const path = isOwnProfile ? '/users/me' : `/users/${userId}`;
      const { data } = await api.get(path);
      return data;
    },
    enabled: !!user && (isOwnProfile || isAdmin),
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setFormState({
      full_name: profileQuery.data.full_name || '',
      extension: profileQuery.data.extension || '',
      picture_url: profileQuery.data.picture_url || '',
    });
    setPreviewUrl(profileQuery.data.picture_url || '');
    setSelectedPhotoFile(null);
    setIsEditing(false);
  }, [profileQuery.data]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const saveProfile = useMutation({
    mutationFn: async (payload) => {
      const path = isOwnProfile ? '/users/me/profile' : `/users/${userId}/profile`;
      const { data } = await api.patch(path, payload);
      return data;
    },
  });

  const uploadProfilePhoto = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const path = isOwnProfile ? '/users/me/upload-photo' : `/users/${userId}/upload-photo`;
      const { data } = await api.post(path, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return data;
    },
  });

  const assignmentCount = profileQuery.data?.conference_assignments?.length || 0;
  const pageTitle = isOwnProfile ? 'My Profile' : `${profileQuery.data?.full_name || 'User'} Profile`;
  const avatarInitials = getInitials(profileQuery.data?.full_name || user?.email, 'P');
  const conferences = useMemo(() => conferencesQuery.data || [], [conferencesQuery.data]);
  const headerBackTo = isOwnProfile ? '/' : '/users';
  const headerBackLabel = isOwnProfile ? 'Dashboard' : 'Manage Access';
  const appRoleLabel = getRoleLabel(profileQuery.data?.role);

  const assignmentByConferenceId = useMemo(() => {
    return new Map((profileQuery.data?.conference_assignments || []).map((assignment) => [assignment.conference_id, assignment]));
  }, [profileQuery.data]);

  useEffect(() => {
    if (!conferences.length) {
      setSelectedConferenceId('');
      return;
    }

    const currentStillExists = conferences.some((conference) => conference.id === selectedConferenceId);
    if (selectedConferenceId && currentStillExists) return;

    const preferredConferenceId = (profileQuery.data?.conference_assignments || [])[0]?.conference_id || conferences[0]?.id || '';
    setSelectedConferenceId(preferredConferenceId);
  }, [conferences, profileQuery.data, selectedConferenceId]);

  const selectedConference = conferences.find((conference) => conference.id === selectedConferenceId) || null;
  const selectedAssignment = assignmentByConferenceId.get(selectedConferenceId);

  const handlePhotoSelection = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setSelectedPhotoFile(nextFile);

    setPreviewUrl((currentPreview) => {
      if (currentPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreview);
      }
      return nextFile ? URL.createObjectURL(nextFile) : (formState.picture_url || '');
    });
  };

  const handleAvatarClick = () => {
    if (!isEditing) return;
    photoInputRef.current?.click();
  };

  const handleCancelEditing = () => {
    setError('');
    setMessage('');
    setIsEditing(false);
    setSelectedPhotoFile(null);
    setFormState({
      full_name: profileQuery.data?.full_name || '',
      extension: profileQuery.data?.extension || '',
      picture_url: profileQuery.data?.picture_url || '',
    });

    setPreviewUrl((currentPreview) => {
      if (currentPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreview);
      }
      return profileQuery.data?.picture_url || '';
    });
  };

  const handleSaveProfile = async () => {
    setError('');
    setMessage('');

    try {
      let pictureUrl = formState.picture_url || null;
      if (selectedPhotoFile) {
        const uploadResult = await uploadProfilePhoto.mutateAsync(selectedPhotoFile);
        pictureUrl = uploadResult.picture_url;
      }

      await saveProfile.mutateAsync({
        ...formState,
        picture_url: pictureUrl,
      });

      setMessage('Profile updated.');
      setIsEditing(false);
      await profileQuery.refetch();
      if (isOwnProfile) {
        await reloadProfile();
      }
    } catch (err) {
      setMessage('');
      setError(err.response?.data?.detail || err.message || 'Failed to update profile');
    }
  };

  if (profileQuery.isLoading || conferencesQuery.isLoading || !user) {
    return <Loader text="Loading profile..." />;
  }

  if (profileQuery.isError) {
    return (
      <div>
        <Header backTo={headerBackTo} backLabel={headerBackLabel} />
        <div className="page-container fade-in">
          <p className="auth-error">{error || profileQuery.error?.response?.data?.detail || profileQuery.error?.message || 'Failed to load profile.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header backTo={headerBackTo} backLabel={headerBackLabel} />
      <div className="page-container fade-in">
        <div className="page-header page-header--start">
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <div className="page-chip-row">
              <span className="page-chip">{assignmentCount} assignment{assignmentCount !== 1 ? 's' : ''}</span>
              {!isOwnProfile && <span className="page-chip">Admin view</span>}
            </div>
          </div>
        </div>

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="auth-success">{message}</p>}

        <section className="card section-card profile-page-sheet">
          <div className="profile-page-section">
            <div className="section-card-head">
              <div>
                <h2 className="section-card-title">Profile Details</h2>
              </div>
            </div>

            <div className="profile-page-hero profile-page-hero--embedded">
              <button
                className={`header-avatar profile-page-avatar profile-page-avatar-button${isEditing ? ' is-editing' : ''}`}
                type="button"
                onClick={handleAvatarClick}
                aria-label={isEditing ? 'Change profile image' : 'Profile image'}
                title={isEditing ? 'Click to change profile image' : undefined}
                disabled={!isEditing}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="header-avatar-image" />
                ) : (
                  avatarInitials
                )}
              </button>
              <div className="profile-page-identity">
                <div className="profile-page-meta-grid">
                  <DetailCell label="App Role" value={appRoleLabel} />
                  <DetailCell label="GLT Extension" value={profileQuery.data.extension} />
                  <DetailCell label="Conference Roles" value={`${assignmentCount}`} />
                  <DetailCell label="Assigned Dignitaries" value={`${profileQuery.data.managed_conference_dignitary_ids?.length || 0}`} />
                </div>
              </div>
            </div>

            <div className="directory-photo-fields">
              <input
                ref={photoInputRef}
                className="profile-photo-input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handlePhotoSelection}
                disabled={!isEditing}
              />
              <FormField label="Full Name">
                <input
                  className="input"
                  value={formState.full_name}
                  onChange={(e) => setFormState((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Protocol officer name"
                  disabled={!isEditing}
                />
              </FormField>
              <FormField label="GLT Extension">
                <input
                  className="input"
                  value={formState.extension}
                  onChange={(e) => setFormState((prev) => ({ ...prev, extension: e.target.value }))}
                  placeholder="Enter GLT extension"
                  disabled={!isEditing}
                />
              </FormField>
            </div>

            <div className="form-actions">
              {isEditing && (
                <button className="btn btn-outline" type="button" onClick={handleCancelEditing} disabled={saveProfile.isPending || uploadProfilePhoto.isPending}>
                  Cancel
                </button>
              )}
              <button
                className="btn btn-gold"
                type="button"
                onClick={isEditing ? handleSaveProfile : () => setIsEditing(true)}
                disabled={saveProfile.isPending || uploadProfilePhoto.isPending}
              >
                <PencilLine size={16} />
                {saveProfile.isPending || uploadProfilePhoto.isPending
                  ? 'Saving...'
                  : isEditing
                    ? 'Save Profile'
                    : 'Edit Profile'}
              </button>
            </div>
          </div>

          <div className="profile-section-divider" />

          <div className="profile-page-section">
            <div className="section-card-head">
              <div>
                <h2 className="section-card-title">Conference Roles</h2>
              </div>
              {isAdmin && !isOwnProfile && (
                <div className="section-card-actions">
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => navigate('/users')}>Manage Access</button>
                </div>
              )}
            </div>

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

                {selectedConference && !selectedAssignment && (
                  <div className="empty-state profile-page-empty">
                    <div className="empty-state-icon">Assignments</div>
                    <p className="empty-state-text">No conference role set for {selectedConference.name}.</p>
                  </div>
                )}

                {selectedConference && selectedAssignment && (
                  <article className="profile-assignment-card">
                    <div className="profile-assignment-top">
                      <div>
                        <h3 className="profile-summary-title">{selectedConference.name}</h3>
                        <p className="profile-summary-meta">
                          {[selectedConference.date, selectedConference.venue].filter(Boolean).join(' - ') || 'Conference details not set'}
                        </p>
                      </div>
                      <span className="page-chip">{selectedAssignment.conference_role || 'No conference role assigned'}</span>
                    </div>
                    <div className="profile-assignment-grid">
                      <DetailCell label="Assigned Dignitary" value={selectedAssignment.assigned_dignitary?.name || 'No dignitary assigned'} />
                      <DetailCell label="Dignitary Title" value={selectedAssignment.assigned_dignitary?.title || ''} />
                      <DetailCell label="First Arrival Session" value={selectedAssignment.first_arrival_session?.name || ''} />
                      <DetailCell label="GLT Extension" value={profileQuery.data.extension} />
                    </div>
                  </article>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
