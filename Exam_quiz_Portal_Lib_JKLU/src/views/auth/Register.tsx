import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';
import JKLULogo from '@/components/layout/JKLULogo';
import CrystalizedBall from '@/components/layout/CrystalizedBall';
import RobotCheck, { type CaptchaPayload } from '@/components/auth/RobotCheck';
import { getPostLoginDestination, sanitizeNextPath } from '@/utils/postLoginRedirect';

const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('B.TECH');
  const [year, setYear] = useState('3');
  const [rollNo, setRollNo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = sanitizeNextPath(searchParams.get('next'));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.endsWith('@jklu.edu.in')) {
      setError('Please use your @jklu.edu.in university email address.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!captcha) {
      setError('Please complete the "I am not a robot" verification.');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), name.trim(), password, confirmPassword, captcha, {
        department,
        year,
        roll_no: rollNo.trim().toUpperCase() || undefined,
      });
      navigate(getPostLoginDestination(null, nextParam), { replace: true });
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
      setCaptchaResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#FAF9F6] dark:bg-[#0A0A0C] text-[#0A0A0C] dark:text-[#F5F4F0] px-4 py-6 overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <CrystalizedBall
          preset="plasma"
          color="#F25BD0"
          theme={theme === 'dark' ? 'dark' : 'light'}
          size={0.7}
          crackle={0.85}
          fill={0.5}
          interactive
          hoverStrength={0.7}
          strands={6}
          flares={0.65}
          glow={0.9}
          sparks={0.6}
          particleCount={15000}
          motion="rise"
          particleShape="square"
          depth={0.6}
          sway={0.5}
          twinkle={0.5}
          haze={0.7}
          dustSpeed={1}
          speed={1}
          intro
          paused={false}
        />
      </div>

      <div className="relative z-10 max-w-6xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <JKLULogo size="sm" />
          <button
            onClick={() => navigate('/home')}
            className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-[#5C5B57] dark:text-[#94938E] hover:text-[#0A0A0C] dark:hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
        </div>
        <ThemeSwitcher />
      </div>

      <div className="relative z-10 max-w-md w-full mx-auto bg-white/95 dark:bg-[#111117]/95 backdrop-blur-md border border-[#E5E2DC] dark:border-white/15 shadow-xl rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#4F46E5] dark:text-[#A5B4FC]">
            JKLU · STUDENT REGISTRATION
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Create Student Account</h1>
          <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
            Register with your @jklu.edu.in email to submit past question papers and participate in Coding Hour.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded border border-[#E04F33]/40 bg-[#E04F33]/10 text-xs text-[#E04F33]">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#5C5B57] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aarav Sharma"
                className="input-field pl-10 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
              JKLU Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#5C5B57] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@jklu.edu.in"
                className="input-field pl-10 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="block text-[10px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                Programme
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="input-field text-xs py-2"
              >
                <option value="B.TECH">B.TECH</option>
                <option value="BBA">BBA</option>
                <option value="BCA">BCA</option>
                <option value="B.DES">B.DES</option>
                <option value="M.TECH">M.TECH</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                Semester
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="input-field text-xs py-2"
              >
                {['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                Roll No
              </label>
              <input
                type="text"
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                placeholder="2024BTECH042"
                className="input-field text-xs py-2 font-mono-tabular uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#5C5B57] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="input-field pl-10 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C5B57]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="input-field text-sm"
            />
          </div>

          <RobotCheck onChange={setCaptcha} resetKey={captchaResetKey} />

          <button type="submit" disabled={loading} className="w-full btn-primary text-sm py-3">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-[#5C5B57] dark:text-[#94938E]">
          Already registered?{' '}
          <Link
            to={nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : '/login'}
            className="text-[#0A0A0C] dark:text-white font-medium underline"
          >
            Sign in
          </Link>
        </p>
      </div>

      <div className="relative z-10 text-center text-xs font-mono-tabular text-[#5C5B57] dark:text-[#94938E]">
        JK LAKSHMIPAT UNIVERSITY · LEARN JKLU
      </div>
    </div>
  );
};

export default Register;
