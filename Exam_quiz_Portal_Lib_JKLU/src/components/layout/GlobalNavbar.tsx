import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  FileText,
  BookOpen,
  GraduationCap,
  LogOut,
  Shield,
  User,
  Menu,
  X,
  Upload,
} from 'lucide-react';
import JKLULogo from '@/components/layout/JKLULogo';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { buildLoginUrl } from '@/utils/postLoginRedirect';
import techAffairsLogo from '@/assets/technical-affairs-logo.png';

const formatShortDisplayName = (fullName?: string): string => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'User';
  if (parts.length >= 2 && /^(dr|prof|mr|mrs|ms)\.?$/i.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
};

const GlobalNavbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const path = location.pathname;
  const isHome = path === '/' || path === '/home';
  const isPastPapers = path.startsWith('/past-papers') || path.startsWith('/papers');
  const isClassroom = path.startsWith('/classroom');
  const isFaculty = path.startsWith('/faculty');
  const isProfile = path.startsWith('/profile');

  const navItems = [
    { to: '/home', label: 'Home', icon: Home, active: isHome },
    { to: '/past-papers', label: 'Past Papers', icon: FileText, active: isPastPapers },
    { to: '/classroom', label: 'Classrooms', icon: BookOpen, active: isClassroom },
    { to: '/faculty', label: 'Faculty & TAs', icon: GraduationCap, active: isFaculty },
  ];

  const isAdmin = Boolean(user?.is_admin || user?.admin_role === 'full_admin');
  const isProfessor = user?.admin_role === 'professor';
  const isTa = Boolean(
    (user?.ta_offering_ids && user.ta_offering_ids.length > 0) ||
      user?.is_ta ||
      user?.admin_role === 'ta'
  );
  const isSubAdmin = Boolean(user?.is_sub_admin);
  const roleLabel = isAdmin
    ? 'Admin'
    : isProfessor
      ? 'Faculty'
      : isTa
        ? 'Student · TA'
        : isSubAdmin
          ? 'Staff'
          : 'Student';

  return (
    <header className="sticky top-0 z-50 border-b border-[#E5E2DC]/80 dark:border-white/10 bg-[#FAF9F6]/90 dark:bg-[#0A0A0C]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2.5">
        {/* Left: Editorial Brand Lockup */}
        <Link to="/home" className="flex items-center gap-2 sm:gap-2.5 shrink-0 group">
          <JKLULogo size="xs" className="sm:hidden shrink-0" />
          <JKLULogo size="sm" className="hidden sm:block shrink-0" />
          <img
            src={(techAffairsLogo as any)?.src || techAffairsLogo}
            alt="Council of Technical Affairs"
            className="h-7 w-7 sm:h-8 sm:w-8 rounded-md object-cover border border-[#E5E2DC] dark:border-[#232329] shrink-0"
          />
          <div className="h-5 w-[1px] bg-[#E5E2DC] dark:bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-tight text-xs sm:text-base text-[#0A0A0C] dark:text-[#F5F4F0]">
              Learn JKLU
            </span>
            <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-[#0A0A0C] dark:bg-white/10 text-[#FAF9F6] dark:text-[#C4C3BE]">
              2.0
            </span>
          </div>
        </Link>

        {/* Center: Clean 4-Tab Pill Bar */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-[#E5E2DC] dark:border-white/10"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                  item.active
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]'
                    : 'text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#0A0A0C] dark:hover:text-[#F5F4F0]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Theme Switcher + Real Production Auth Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ThemeSwitcher />

          {user ? (
            <div className="hidden sm:flex items-center gap-1.5">
              {!isAdmin && !isSubAdmin ? (
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  title="Open Profile"
                  className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium max-w-[210px] truncate transition-[border-color]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">
                    {formatShortDisplayName(user.name)} · {roleLabel}
                  </span>
                </button>
              ) : (
                <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium max-w-[210px] truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">
                    {formatShortDisplayName(user.name)} · {roleLabel}
                  </span>
                </span>
              )}

              {isAdmin ? (
                <button
                  onClick={() => navigate('/admin')}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#E04F33] text-white text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
              ) : isProfessor ? (
                <button
                  onClick={() => navigate('/profile')}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity ${
                    isProfile
                      ? 'bg-[#E04F33] text-white'
                      : 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Profile</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Paper</span>
                  </button>
                  <button
                    onClick={() => navigate('/profile')}
                    title="Profile"
                    className={`p-1.5 rounded-lg border transition-[border-color] ${
                      isProfile
                        ? 'border-[#896ABD] bg-[#896ABD]/10 text-[#896ABD] dark:text-[#C084FC]'
                        : 'border-[#E5E2DC] dark:border-white/15 bg-white/80 dark:bg-[#121216] text-[#0A0A0C] dark:text-[#F5F4F0] hover:border-[#896ABD]'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  logout();
                  navigate('/home');
                }}
                title="Sign Out"
                className="p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#E04F33] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => navigate(buildLoginUrl(location.pathname, location.search))}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E2DC] dark:border-white/15 bg-white/80 dark:bg-[#121216] text-[#0A0A0C] dark:text-[#F5F4F0] hover:border-[#0A0A0C] dark:hover:border-[#F5F4F0] transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/admin-login')}
                className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white transition-colors"
              >
                Admin
              </button>
            </div>
          )}

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-[#0A0A0C] dark:text-[#F5F4F0]"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-[#0A0A0C] px-4 py-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border ${
                    item.active
                      ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] border-transparent'
                      : 'border-[#E5E2DC] dark:border-white/10 text-[#5C5B57] dark:text-[#C4C3BE]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#E5E2DC] dark:border-white/10 flex items-center gap-2">
            {user ? (
              isProfessor ? (
                <>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      navigate('/profile');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      logout();
                      navigate('/home');
                    }}
                    className="px-3 py-2 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-xs text-[#E04F33] font-medium"
                  >
                    Sign Out
                  </button>
                </>
              ) : isAdmin || isSubAdmin ? (
                <>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      navigate('/admin');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium"
                  >
                    Admin Console
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      logout();
                      navigate('/home');
                    }}
                    className="px-3 py-2 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-xs text-[#E04F33] font-medium"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      navigate('/dashboard');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium"
                  >
                    Upload Paper
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      navigate('/profile');
                    }}
                    className="px-3 py-2 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-xs font-medium"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      logout();
                      navigate('/home');
                    }}
                    className="px-3 py-2 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-xs text-[#E04F33] font-medium"
                  >
                    Sign Out
                  </button>
                </>
              )
            ) : (
              <>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    navigate(buildLoginUrl(location.pathname, location.search));
                  }}
                  className="flex-1 py-2 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-xs font-medium"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    navigate('/admin-login');
                  }}
                  className="flex-1 py-2 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium"
                >
                  Admin
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default GlobalNavbar;
