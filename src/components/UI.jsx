import { Loader2, X } from 'lucide-react';

export function Toast({ msg, type }) {
  const c = type === 'error' ? 'var(--danger-strong)' : 'var(--success-strong)';
  return (
    <div className="toast" style={{ border: `1px solid ${c}44`, borderLeft: `3px solid ${c}` }}>
      {msg}
    </div>
  );
}

export function Loader({ text = 'Loading protocol dashboard...' }) {
  return (
    <div className="loader-screen">
      <Loader2 className="loader-spin" size={38} />
      <p className="loader-text">{text}</p>
    </div>
  );
}

export function Modal({ children, onClose }) {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, sub, onClose }) {
  return (
    <div className="modal-header-bar">
      <div>
        <h2 className="modal-header-title">{title}</h2>
        {sub && <p className="modal-header-sub">{sub}</p>}
      </div>
      <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 22, lineHeight: 1, padding: '4px 8px', flexShrink: 0 }}>
        <X size={20} />
      </button>
    </div>
  );
}

export function FormField({ label, children }) {
  return (
    <div className="form-field">
      <label className="form-field-label">{label}</label>
      {children}
    </div>
  );
}

export function RoleTag({ role }) {
  const map = {
    admin: { c: 'var(--warning-strong)', l: 'Admin' },
    editor: { c: 'var(--accent-strong)', l: 'Editor' },
    protocol: { c: 'var(--success-strong)', l: 'Protocol Officer' },
    unknown: { c: 'var(--text-muted)', l: 'Loading Role' },
  };
  const r = map[role] || map.unknown;
  return <span className="role-tag" style={{ color: r.c }}>{r.l}</span>;
}
