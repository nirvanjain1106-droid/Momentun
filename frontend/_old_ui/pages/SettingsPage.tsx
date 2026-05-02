import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  LogOut,
  MessageSquare,
  MoonStar,
  Shield,
  User,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { userApi, type FeedbackPayload, type UserProfile } from '../api/userApi';

const supportedTimezones = (() => {
  const intlWithValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  if (typeof Intl !== 'undefined' && typeof intlWithValues.supportedValuesOf === 'function') {
    try {
      return intlWithValues.supportedValuesOf('timeZone');
    } catch {
      return ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'];
    }
  }

  return ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'];
})();

export default function SettingsPage() {
  const { logout, setUserName } = useAuthStore();
  const { addToast, openModal } = useUIStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [pauseReason, setPauseReason] = useState<'sick' | 'vacation' | 'burnout' | 'personal' | 'other'>('personal');
  const [pauseDays, setPauseDays] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [feedbackType, setFeedbackType] = useState<FeedbackPayload['feedback_type']>('general');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isChangingPauseState, setIsChangingPauseState] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadProfile() {
      setIsLoading(true);
      try {
        const result = await userApi.getProfile();
        if (ignore) return;
        setProfile(result);
        setName(result.name);
        setTimezone(result.timezone);
        setUserName(result.name);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load profile';
        addToast({ type: 'error', message });
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void loadProfile();
    return () => {
      ignore = true;
    };
  }, [addToast, setUserName]);

  const initials = useMemo(() => {
    const source = profile?.name || 'Momentum User';
    return source
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [profile?.name]);

  const handleProfileSave = async () => {
    if (!name.trim()) {
      addToast({ type: 'warning', message: 'Name cannot be empty.' });
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await userApi.updateProfile({
        name: name.trim(),
        timezone,
      });
      setProfile(updated);
      setUserName(updated.name);
      addToast({ type: 'success', message: 'Profile updated.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not update profile';
      addToast({ type: 'error', message });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordForm.current_password || !passwordForm.new_password) {
      addToast({ type: 'warning', message: 'Fill both password fields first.' });
      return;
    }

    setIsSubmittingPassword(true);
    try {
      await userApi.changePassword(passwordForm);
      setPasswordForm({ current_password: '', new_password: '' });
      addToast({ type: 'success', message: 'Password updated.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update password';
      addToast({ type: 'error', message });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handlePauseResume = async () => {
    if (!profile) return;

    setIsChangingPauseState(true);
    try {
      const nextProfile = profile.is_paused
        ? await userApi.resumeAccount()
        : await userApi.pauseAccount({
            reason: pauseReason,
            days: pauseDays ? Number(pauseDays) : undefined,
          });

      setProfile(nextProfile);
      addToast({
        type: 'success',
        message: nextProfile.is_paused ? 'Momentum paused for recovery.' : 'Momentum resumed.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to change pause state';
      addToast({ type: 'error', message });
    } finally {
      setIsChangingPauseState(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (feedbackMessage.trim().length < 10) {
      addToast({ type: 'warning', message: 'Feedback should be at least 10 characters.' });
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      await userApi.submitFeedback({
        feedback_type: feedbackType,
        message: feedbackMessage.trim(),
        screen_state: 'profile',
        device_info: navigator.userAgent,
      });
      setFeedbackMessage('');
      addToast({ type: 'success', message: 'Thanks — feedback sent.' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit feedback';
      addToast({ type: 'error', message });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleExportData = async () => {
    try {
      const blob = await userApi.exportData();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'momentum-export.json');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to export data';
      addToast({ type: 'error', message });
    }
  };

  const handleDeleteAccount = () => {
    openModal({
      name: 'confirm-delete',
      data: {
        title: 'Delete account',
        onConfirm: async () => {
          try {
            await userApi.deleteAccount();
            await logout();
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to delete account';
            addToast({ type: 'error', message });
          }
        },
      },
    });
  };

  if (isLoading) {
    return (
      <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
        <div className="mx-auto flex min-h-[420px] max-w-5xl items-center justify-center text-sm text-slate-400">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell-light min-h-full rounded-[32px] p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="light-surface rounded-[28px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-lg font-semibold text-white">
                {initials}
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Profile</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {profile?.name ?? 'Momentum User'}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {profile?.email} · {profile?.timezone}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="light-surface rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <User size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Profile settings</h2>
                <p className="text-sm text-slate-500">Keep the app in sync with who you are and where you work.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Display name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Timezone</label>
                <input
                  list="momentum-timezones"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                />
                <datalist id="momentum-timezones">
                  {supportedTimezones.map((entry) => (
                    <option key={entry} value={entry} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Account state</p>
                <p className="mt-1 text-sm text-slate-500">
                  {profile?.is_paused ? `Paused: ${profile.paused_reason ?? 'manual pause'}` : 'Active and scheduling normally'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleProfileSave}
                disabled={isSavingProfile}
                className="rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSavingProfile ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>

          <div className="light-surface rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <MoonStar size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Pause planning</h2>
                <p className="text-sm text-slate-500">Use when recovery, travel, or life noise should stop the planner from pushing.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Reason</label>
                <select
                  value={pauseReason}
                  onChange={(event) => setPauseReason(event.target.value as typeof pauseReason)}
                  className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                  disabled={profile?.is_paused}
                >
                  <option value="sick">Sick</option>
                  <option value="vacation">Vacation</option>
                  <option value="burnout">Burnout</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Days (optional)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={pauseDays}
                  onChange={(event) => setPauseDays(event.target.value)}
                  className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                  disabled={profile?.is_paused}
                />
              </div>

              <button
                type="button"
                onClick={handlePauseResume}
                disabled={isChangingPauseState}
                className="w-full rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isChangingPauseState ? 'Updating...' : profile?.is_paused ? 'Resume Momentum' : 'Pause Momentum'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <form onSubmit={handlePasswordChange} className="light-surface rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Shield size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Security</h2>
                <p className="text-sm text-slate-500">Update your password without leaving the app.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Current password</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) => setPasswordForm((state) => ({ ...state, current_password: event.target.value }))}
                  className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">New password</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm((state) => ({ ...state, new_password: event.target.value }))}
                  className="mt-2 w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingPassword}
                className="w-full rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSubmittingPassword ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </form>

          <div className="light-surface rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <MessageSquare size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Feedback</h2>
                <p className="text-sm text-slate-500">Report friction, request features, or tell us what is working.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <select
                value={feedbackType}
                onChange={(event) => setFeedbackType(event.target.value as FeedbackPayload['feedback_type'])}
                className="w-full rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
              >
                <option value="general">General feedback</option>
                <option value="bug">Bug report</option>
                <option value="feature">Feature request</option>
                <option value="schedule_quality">Schedule quality</option>
              </select>
              <textarea
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                className="min-h-[150px] w-full rounded-[24px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none"
                placeholder="Tell Momentum what you want it to do better..."
              />
              <button
                type="button"
                onClick={handleFeedbackSubmit}
                disabled={isSubmittingFeedback}
                className="w-full rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSubmittingFeedback ? 'Sending...' : 'Send feedback'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="light-surface rounded-[30px] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Download size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Data export</h2>
                <p className="text-sm text-slate-500">Download your Momentum history as JSON.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportData}
              className="mt-5 w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
            >
              Export my data
            </button>
          </div>

          <div className="light-surface rounded-[30px] border border-rose-200 bg-rose-50/70 p-5">
            <h2 className="text-xl font-semibold text-rose-700">Danger zone</h2>
            <p className="mt-2 text-sm leading-6 text-rose-600/80">
              Deleting your account permanently removes your goals, schedules, and history. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="mt-5 w-full rounded-full bg-rose-600 px-4 py-3 text-sm font-medium text-white"
            >
              Delete account
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
