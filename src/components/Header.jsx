import { ArrowLeft, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth-context';
import { useTheme } from './theme-context';
import { RoleTag } from './UI';

function getDefaultBackTarget(pathname) {
  if (pathname === '/profile' || pathname === '/dignitaries' || pathname === '/users') return '/';
  if (pathname.startsWith('/conference/')) return '/';
  if (pathname.startsWith('/users/')) return '/users';
  if (pathname.startsWith('/session/')) return '/';
  return null;
}

function getDefaultBackLabel(pathname) {
  if (pathname === '/profile' || pathname === '/dignitaries' || pathname === '/users') return 'Dashboard';
  if (pathname.startsWith('/conference/')) return 'Dashboard';
  if (pathname.startsWith('/users/')) return 'Manage Access';
  if (pathname.startsWith('/session/')) return 'Conference';
  return 'Back';
}

export function Header({ confName, sessionName, backTo, backLabel }) {
  const { user, profile, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const resolvedBackTo = backTo || getDefaultBackTarget(location.pathname);
  const resolvedBackLabel = backLabel || getDefaultBackLabel(location.pathname);
  const showBackButton = Boolean(resolvedBackTo);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleBack = () => {
    if (!resolvedBackTo) return;
    setDrawerOpen(false);
    navigate(resolvedBackTo);
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Loading...';
  const avatarImage = profile?.picture_url || user?.user_metadata?.picture_url || '';
  const avatarInitials = displayName
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  return (
    <>
      <header className="app-header">
        <div className="header-logo" onClick={() => navigate('/')}>
          <div className="header-logo-title">Dignitary Management System</div>
        </div>

        <div className="header-breadcrumbs">
          {confName && (
            <>
              <span className="header-breadcrumb-sep">/</span>
              <button className="btn btn-ghost btn-sm header-crumb-btn" onClick={() => navigate(-1)}>
                {confName}
              </button>
            </>
          )}
          {sessionName && (
            <>
              <span className="header-breadcrumb-sep">/</span>
              <span className="header-crumb-current">{sessionName}</span>
            </>
          )}
        </div>

        <div className="header-actions">
          <button className="header-theme-toggle btn btn-ghost btn-icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {showBackButton && (
            <button
              className="btn btn-ghost header-back-btn"
              onClick={handleBack}
              aria-label={`Back to ${resolvedBackLabel}`}
            >
              <ArrowLeft size={16} />
              <span className="header-back-label">{resolvedBackLabel}</span>
            </button>
          )}

          <div className="header-account">
            <div className="header-avatar">
              {avatarImage ? (
                <img src={avatarImage} alt="" className="header-avatar-image" />
              ) : (
                avatarInitials
              )}
            </div>
            <div className="header-user-info">
              <RoleTag role={profile?.role} />
            </div>
          </div>

          <button className="header-menu-toggle btn btn-ghost btn-icon" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
        </div>
      </header>

      <div className={`header-drawer-overlay ${drawerOpen ? '' : 'hidden'}`} onClick={() => setDrawerOpen(false)} />
      <div className={`header-mobile-drawer ${drawerOpen ? '' : 'hidden'}`}>
        <div className={`header-drawer-top ${showBackButton ? '' : 'header-drawer-top--end'}`}>
          {showBackButton && (
            <button className="btn btn-ghost header-drawer-link header-drawer-link--back" onClick={handleBack}>
              <ArrowLeft size={16} />
              <span>{resolvedBackLabel}</span>
            </button>
          )}
          <button className="btn btn-ghost btn-icon" onClick={() => setDrawerOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="header-drawer-profile">
          <div className="header-avatar">
            {avatarImage ? (
              <img src={avatarImage} alt="" className="header-avatar-image" />
            ) : (
              avatarInitials
            )}
          </div>
          <div>
            <div className="header-user-name">{displayName}</div>
            <RoleTag role={profile?.role} />
          </div>
        </div>

        <button
          className="btn btn-ghost header-drawer-link"
          style={{ color: location.pathname === '/profile' ? 'var(--accent-strong)' : undefined }}
          onClick={() => { navigate('/profile'); setDrawerOpen(false); }}
        >
          My Profile
        </button>

        {isAdmin && (
          <button
            className="btn btn-ghost header-drawer-link"
            style={{ color: location.pathname === '/dignitaries' ? 'var(--accent-strong)' : undefined }}
            onClick={() => { navigate('/dignitaries'); setDrawerOpen(false); }}
          >
            Dignitary
          </button>
        )}

        {isAdmin && (
          <button
            className="btn btn-ghost header-drawer-link"
            style={{ color: location.pathname === '/users' ? 'var(--accent-strong)' : undefined }}
            onClick={() => { navigate('/users'); setDrawerOpen(false); }}
          >
            Manage Access
          </button>
        )}

        <div className="header-drawer-footer">
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
