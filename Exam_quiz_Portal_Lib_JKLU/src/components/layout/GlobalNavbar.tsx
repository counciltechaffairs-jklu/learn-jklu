import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE_OUT, SPRING_FLUID } from '@/components/animations/MotionPrimitives';
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
  Bell,
  CheckCheck,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import JKLULogo from '@/components/layout/JKLULogo';
import { useAuth } from '@/contexts/AuthContext';
import { buildLoginUrl, getAdminSecretPath } from '@/utils/postLoginRedirect';
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
  const [scrolled, setScrolled] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    let mounted = true;
    const fetchNotifs = () => {
      classroomApi
        .getNotifications(15)
        .then((data) => {
          if (!mounted) return;
          setNotifications(data?.notifications || []);
          setUnreadCount(Number(data?.unread_count || 0));
        })
        .catch(() => {});
    };
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 45000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [user?.id]);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 12;
      setScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    { to: '/faculty', label: 'Faculty', icon: GraduationCap, active: isFaculty },
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
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          scrolled
            ? 'bg-[#FAF9F6]/78 backdrop-blur-xl saturate-150 border-[#0A0A0C]/10 shadow-[0_8px_28px_rgba(10,10,12,0.06)]'
            : 'bg-white border-[#DCD8D0]'
        }`}
      >
        {/* Subtle Architectural Constellation Backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 overflow-hidden z-0"
        >
          <svg
            viewBox="0 0 1440 80"
            preserveAspectRatio="none"
            className="w-full h-full opacity-70"
          >
        <defs>
          <linearGradient id="navAccentLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E04F33" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#896ABD" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path
          d="M0 1.5 H1440"
          stroke="url(#navAccentLine)"
          strokeWidth="2.5"
          fill="none"
        />
        <g stroke="#896ABD" strokeOpacity="0.16" strokeWidth="1" fill="none">
          <path d="M180 0 L240 42 L320 14 L410 66" />
          <path d="M1060 72 L1145 20 L1245 52 L1340 12" />
        </g>
        <circle cx="240" cy="42" r="2.6" fill="#E04F33" fillOpacity="0.28" />
        <circle cx="320" cy="14" r="2" fill="#896ABD" fillOpacity="0.32" />
        <circle cx="1145" cy="20" r="2.6" fill="#896ABD" fillOpacity="0.32" />
        <circle cx="1245" cy="52" r="2" fill="#E04F33" fillOpacity="0.28" />
          <rect
            x="1340"
            y="16"
            width="34"
            height="34"
            rx="8"
            stroke="#E04F33"
            strokeOpacity="0.14"
            fill="none"
            transform="rotate(14 1357 33)"
          />
        </svg>
      </div>

      <div className="relative z-10 max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 h-[72px] sm:h-[78px] flex items-center justify-between gap-2.5">
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

        {/* Center: Clean 4-Tab Pill Bar with Shared Sliding Indicator */}
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
                className={`relative px-3.5 py-1.5 rounded-[10px] text-xs font-medium inline-flex items-center gap-1.5 transition-colors duration-150 active:scale-[0.97] ${
                  item.active
                    ? 'text-[#FAF9F6]'
                    : 'text-[#3A3936] hover:text-[#0A0A0C]'
                }`}
              >
                {item.active && (
                  <motion.span
                    layoutId="globalNavActivePill"
                    transition={SPRING_FLUID}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[10px] bg-[#0A0A0C] shadow-sm"
                  />
                )}
                <Icon className="w-3.5 h-3.5 shrink-0 relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Real Production Auth Controls (Permanent Light Theme) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

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

              {isAdmin || isSubAdmin ? (
                <button
                  onClick={() => navigate(getAdminSecretPath() || '/home')}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#E04F33] text-white text-xs font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin Console</span>
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

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  title="Classroom Notifications"
                  aria-label="Notifications"
                  className="relative p-1.5 rounded-lg border border-[#E5E2DC] bg-white/85 text-[#0A0A0C] hover:border-[#896ABD] transition-[border-color,transform] duration-150 active:scale-[0.96]"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#E04F33] text-white font-mono-tabular text-[9px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: EASE_OUT }}
                      style={{ transformOrigin: 'top right' }}
                      className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-[#DDD8CE] bg-white shadow-[var(--shadow-elevated)] z-50 p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-[#E5E2DC]">
                        <span className="font-semibold text-[#0A0A0C]">
                          Notifications ({unreadCount} unread)
                        </span>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              await classroomApi.markAllNotificationsRead();
                              setUnreadCount(0);
                              setNotifications((prev) =>
                                prev.map((n) => ({ ...n, is_read: true }))
                              );
                            }}
                            className="text-[11px] font-semibold text-[#896ABD] hover:underline inline-flex items-center gap-1"
                          >
                            <CheckCheck className="w-3 h-3" /> Mark all read
                          </button>
                        )}
                      </div>
                      {notifications.length === 0 ? (
                        <p className="py-4 text-center text-[#5C5B57]">No notifications yet.</p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={async () => {
                              if (!n.is_read) {
                                classroomApi.markNotificationRead(n.id).catch(() => {});
                                setNotifications((prev) =>
                                  prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
                                );
                                setUnreadCount((c) => Math.max(0, c - 1));
                              }
                              setNotifOpen(false);
                              navigate(n.link_path || '/classroom');
                            }}
                            className={`w-full text-left p-2.5 rounded-[11px] border transition-[background-color,border-color] duration-150 ${
                              n.is_read
                                ? 'border-[#E5E2DC]/60 bg-[#FAF9F6]/60'
                                : 'border-[#E04F33]/35 bg-[#E04F33]/5'
                            }`}
                          >
                            <div className="font-semibold text-[#0A0A0C] line-clamp-1">
                              {n.title}
                            </div>
                            {n.body && (
                              <p className="text-[11px] text-[#5C5B57] line-clamp-2 mt-0.5">
                                {n.body}
                              </p>
                            )}
                            <div className="text-[10px] font-mono-tabular text-[#8E8D88] mt-1">
                              {new Date(n.created_at).toLocaleString()}
                            </div>
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => {
                  logout();
                  navigate('/home');
                }}
                title="Sign Out"
                className="p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#E04F33] transition-[color,border-color,transform] duration-150 active:scale-[0.96]"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => navigate(buildLoginUrl(location.pathname, location.search))}
                className="px-3.5 py-1.5 rounded-lg bg-[#0A0A0C] text-[#FAF9F6] text-xs font-medium hover:bg-[#E04F33] transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 text-[#0A0A0C] dark:text-[#F5F4F0] active:scale-[0.95] transition-transform duration-150"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="md:hidden border-t border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-[#0A0A0C] px-4 py-3 space-y-2.5"
          >
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border active:scale-[0.97] transition-transform duration-100 ${
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
                      navigate(getAdminSecretPath() || '/home');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#0A0A0C] text-[#FAF9F6] text-xs font-medium"
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
              <button
                onClick={() => {
                  setMobileOpen(false);
                  navigate(buildLoginUrl(location.pathname, location.search));
                }}
                className="flex-1 py-2 rounded-lg bg-[#0A0A0C] text-[#FAF9F6] text-xs font-medium"
              >
                Sign In
              </button>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </header>
    <div aria-hidden="true" className="h-[73px] sm:h-[79px] shrink-0" />
  </>
  );
};

export default GlobalNavbar;
