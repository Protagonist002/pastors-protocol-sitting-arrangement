import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { Loader, Modal, ModalHeader, FormField } from '../components/UI';
import { useAuth } from '../components/auth-context';
import { useDirectoryDignitaries } from '../hooks/useDignitaryDirectory';
import { getInitials } from '../lib/formatters';

function DirectoryForm({ init = {}, isEdit, onSave, onCancel, onUploadPhoto }) {
  const [f, setF] = useState({
    name: '',
    title: '',
    church: '',
    extension: '',
    notes: '',
    picture_url: '',
    ...init,
  });
  const [pictureFile, setPictureFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(init.picture_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const s = (k, v) => setF((current) => ({ ...current, [k]: v }));

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handlePictureChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setPictureFile(nextFile);

    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    if (nextFile) {
      setPreviewUrl(URL.createObjectURL(nextFile));
      return;
    }

    setPreviewUrl(f.picture_url || '');
  };

  const handleRemovePicture = () => {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPictureFile(null);
    setPreviewUrl('');
    s('picture_url', '');
  };

  const handleSave = async () => {
    if (!f.name || !f.title) return;
    setSaving(true);
    setError('');
    try {
      let pictureUrl = f.picture_url || null;
      if (pictureFile) {
        const uploadResult = await onUploadPhoto(pictureFile);
        pictureUrl = uploadResult.picture_url;
      }
      const cleaned = Object.fromEntries(
        Object.entries({ ...f, picture_url: pictureUrl }).map(([k, v]) => [k, v === '' ? null : v])
      );
      await onSave(cleaned);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
        : err?.message || 'Failed to save dignitary';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return <>
    <ModalHeader title={isEdit ? 'Edit Directory Dignitary' : 'New Directory Dignitary'} onClose={onCancel} />
    <div className="modal-body">
      {error && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13, padding: 8, background: '#ef444422', borderRadius: 6 }}>{error}</p>}
      <div className="form-grid-2">
        <FormField label="Name *"><input className="input" value={f.name} onChange={(e) => s('name', e.target.value)} placeholder="John Mensah" /></FormField>
        <FormField label="Title *"><input className="input" value={f.title} onChange={(e) => s('title', e.target.value)} placeholder="Pastor / Bishop / H.E." /></FormField>
      </div>
      <div className="form-grid-2">
        <FormField label="Church"><input className="input" value={f.church} onChange={(e) => s('church', e.target.value)} placeholder="GLT" /></FormField>
        <FormField label="Branch / Extension"><input className="input" value={f.extension} onChange={(e) => s('extension', e.target.value)} placeholder="North Campus" /></FormField>
      </div>
      <FormField label="Dignitary Image">
        <div className="directory-photo-picker">
          <div className="directory-photo-preview" aria-hidden="true">
            {previewUrl
              ? <img src={previewUrl} alt="" className="directory-photo-preview-image" />
              : <span>{getInitials(f.name, '?')}</span>}
          </div>
          <div className="directory-photo-fields">
            <input className="input" type="file" accept="image/*" onChange={handlePictureChange} />
            {(previewUrl || f.picture_url) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleRemovePicture}>
                Remove Image
              </button>
            )}
          </div>
        </div>
      </FormField>
      <FormField label="Notes"><textarea className="input" rows={3} value={f.notes} onChange={(e) => s('notes', e.target.value)} placeholder="Protocol notes or identifying context..." style={{ resize: 'vertical' }} /></FormField>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-gold" onClick={handleSave} disabled={!f.name || !f.title || saving}>{saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Dignitary')}</button>
      </div>
    </div>
  </>;
}

export function DignitaryDirectory() {
  const { profile, isEditorOrAdmin } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const {
    directoryQuery,
    createDirectoryDignitary,
    uploadDirectoryDignitaryPhoto,
    updateDirectoryDignitary,
    deleteDirectoryDignitary,
  } = useDirectoryDignitaries();
  const { data: dignitaries = [], isLoading } = directoryQuery;

  if (isLoading) return <Loader text="Loading Dignitary Directory..." />;
  if (profile?.role !== 'admin') {
    return (
      <div>
        <Header backTo="/" backLabel="Dashboard" />
        <div className="page-container">
          <p style={{ color: '#ef4444' }}>Access denied. Admin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header backTo="/" backLabel="Dashboard" />
      <div className="page-container fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dignitary Directory</h1>
            {isEditorOrAdmin && (
              <div className="page-chip-row">
                <button className="btn btn-gold" onClick={() => setShowNew(true)}>+ New Dignitary</button>
              </div>
            )}
          </div>
        </div>

        {dignitaries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <p className="empty-state-text">No dignitaries saved yet</p>
          </div>
        ) : (
          <div className="grid-cards">
            {dignitaries.map((dignitary) => (
              <div key={dignitary.id} className="card card-hover attendee-card">
                <div className="attendee-card-top">
                  <div className="attendee-avatar" style={{ borderColor: '#143d2255' }}>
                    {dignitary.picture_url
                      ? <img src={dignitary.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : getInitials(dignitary.name, '?')}
                  </div>
                  <div className="attendee-info">
                    <div className="attendee-name">{dignitary.name}</div>
                    <div className="attendee-title">{dignitary.title}</div>
                    {dignitary.church && <div className="attendee-church">{dignitary.church}{dignitary.extension ? ` — ${dignitary.extension}` : ''}</div>}
                  </div>
                </div>
                {dignitary.notes && <p className="card-desc" style={{ marginTop: 12 }}>{dignitary.notes}</p>}
                {isEditorOrAdmin && (
                  <div className="attendee-card-actions" style={{ marginTop: 18 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(dignitary)}>✏ Edit</button>
                    {profile?.role === 'admin' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#ef4444' }}
                        onClick={() => {
                          if (window.confirm(`Delete ${dignitary.name} from the directory?`)) {
                            deleteDirectoryDignitary.mutate(dignitary.id);
                          }
                        }}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <Modal onClose={() => setShowNew(false)}>
          <DirectoryForm
            isEdit={false}
            onUploadPhoto={(file) => uploadDirectoryDignitaryPhoto.mutateAsync(file)}
            onSave={async (data) => {
              await createDirectoryDignitary.mutateAsync(data);
              setShowNew(false);
            }}
            onCancel={() => setShowNew(false)}
          />
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <DirectoryForm
            init={editing}
            isEdit={true}
            onUploadPhoto={(file) => uploadDirectoryDignitaryPhoto.mutateAsync(file)}
            onSave={async (data) => {
              await updateDirectoryDignitary.mutateAsync({ id: editing.id, data });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
