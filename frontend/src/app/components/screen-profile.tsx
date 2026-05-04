import React, { useEffect, useState } from 'react';
import { getMe, logout } from '../../api/userApi';

export interface ProfileScreenProps {
  navigate: (screen: string) => void;
}

interface UserProfile {
  name: string;
  email: string;
  stats?: {
    daysActive: number;
    goalsCompleted: number;
    avgFocusTime: string;
  };
}

export function ProfileScreen({ navigate }: ProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Toggles state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [focusRemindersEnabled, setFocusRemindersEnabled] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getMe();
        setProfile({
          name: data.name,
          email: data.email,
          stats: (data as any).stats ?? { daysActive: 0, goalsCompleted: 0, avgFocusTime: '0h' },
        });
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('login');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FAF6F2]">
        <div className="w-8 h-8 border-4 border-[#B8472A] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Helper for rendering a settings row
  const renderRow = (
    icon: string, 
    label: string, 
    rightElement: React.ReactNode, 
    onClick?: () => void,
    isDestructive?: boolean,
    isLast?: boolean
  ) => (
    <div 
      onClick={onClick}
      className={`w-full h-[52px] flex items-center justify-between px-4 transition-colors ${onClick ? 'cursor-pointer active:bg-[#FAF6F2]' : ''} ${!isLast ? 'border-b border-[#EDE5DE]' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-[20px] select-none" style={{ color: isDestructive ? '#C0392B' : '#B8472A' }}>{icon}</span>
        <span className={`text-[15px] font-medium tracking-tight ${isDestructive ? 'text-[#C0392B]' : 'text-[#1A1210]'}`} style={{ fontFamily: 'var(--font-sf-pro, system-ui)' }}>
          {label}
        </span>
      </div>
      <div>{rightElement}</div>
    </div>
  );

  const renderChevron = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9C8880" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );

  const renderToggle = (active: boolean, onToggle?: () => void, disabled = false) => (
    <button 
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
      disabled={disabled}
      className={`w-[44px] h-[24px] rounded-full relative transition-colors duration-300 ${active ? 'bg-[#1A7A4A]' : 'bg-[#EDE5DE]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`w-[20px] h-[20px] bg-white rounded-full absolute top-[2px] shadow-sm transition-transform duration-300 ${active ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
    </button>
  );

  return (
    <div className="min-h-screen w-full bg-[#FAF6F2] font-sans pb-[100px] flex flex-col items-center">
      
      {/* Header */}
      <header className="w-full max-w-[390px] h-[64px] flex items-center justify-between px-4 sticky top-0 bg-[#FAF6F2]/90 backdrop-blur-md z-10">
        <h1 className="text-[22px] font-bold text-[#1A1210] tracking-tight">Profile</h1>
        <button 
          onClick={() => navigate('settings')}
          className="w-10 h-10 flex items-center justify-center text-[#1A1210] hover:bg-[#EDE5DE]/50 rounded-full transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </header>

      <main className="w-full max-w-[390px] px-4 flex flex-col gap-4">
        
        {/* Profile Identity Card */}
        <div className="bg-white border border-[#EDE5DE] rounded-[16px] p-5 shadow-[0_2px_8px_rgba(26,18,16,0.06)] flex flex-col items-center">
          <div className="w-[72px] h-[72px] bg-[#F5E8E4] rounded-full flex items-center justify-center mb-4 shadow-inner text-[24px] font-bold text-[#B8472A] tracking-tighter">
            {getInitials(profile.name)}
          </div>
          <h2 className="text-[20px] font-bold text-[#1A1210] mb-1">{profile.name}</h2>
          <p className="text-[14px] text-[#9C8880] mb-6">{profile.email}</p>
          
          <button className="w-full h-[44px] bg-white border border-[#EDE5DE] rounded-[12px] flex items-center justify-center text-[15px] font-semibold text-[#1A1210] hover:bg-[#FAF6F2] transition-colors shadow-sm">
            Edit Profile
          </button>
        </div>

        {/* Stats Row */}
        <div className="flex gap-3 w-full">
          <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[16px] p-4 flex flex-col items-center justify-center shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            <span className="text-[22px] font-bold text-[#1A1210] leading-none mb-1">{profile.stats?.daysActive ?? 0}</span>
            <span className="text-[12px] text-[#9C8880] text-center font-medium">Days Active</span>
          </div>
          <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[16px] p-4 flex flex-col items-center justify-center shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            <span className="text-[22px] font-bold text-[#1A1210] leading-none mb-1">{profile.stats?.goalsCompleted ?? 0}</span>
            <span className="text-[12px] text-[#9C8880] text-center font-medium">Completed</span>
          </div>
          <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[16px] p-4 flex flex-col items-center justify-center shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            <span className="text-[22px] font-bold text-[#1A1210] leading-none mb-1">{profile.stats?.avgFocusTime ?? '0h'}</span>
            <span className="text-[12px] text-[#9C8880] text-center font-medium">Avg Focus</span>
          </div>
        </div>

        {/* Section: Goals */}
        <section className="mt-2">
          <h3 className="text-[13px] font-bold text-[#9C8880] uppercase tracking-wider mb-2 px-2">Goals</h3>
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            {renderRow('🎯', 'Active Goals', renderChevron(), () => navigate('goals'))}
            {renderRow('✅', 'Completed', renderChevron(), () => navigate('goals'), false, true)}
          </div>
        </section>

        {/* Section: Preferences */}
        <section className="mt-2">
          <h3 className="text-[13px] font-bold text-[#9C8880] uppercase tracking-wider mb-2 px-2">Preferences</h3>
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            {renderRow('🔔', 'Notifications', renderToggle(notificationsEnabled, () => setNotificationsEnabled(!notificationsEnabled)))}
            {renderRow('🌙', 'Dark Mode', renderToggle(false, undefined, true))}
            {renderRow('⏱️', 'Focus Reminders', renderToggle(focusRemindersEnabled, () => setFocusRemindersEnabled(!focusRemindersEnabled)), undefined, false, true)}
          </div>
        </section>

        {/* Section: Account */}
        <section className="mt-2 mb-6">
          <h3 className="text-[13px] font-bold text-[#9C8880] uppercase tracking-wider mb-2 px-2">Account</h3>
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            {renderRow('🔒', 'Change Password', renderChevron())}
            {renderRow('🛡️', 'Privacy Policy', renderChevron())}
            {renderRow('📄', 'Terms of Service', renderChevron())}
            {renderRow('🚪', 'Sign Out', null, handleLogout, true, true)}
          </div>
        </section>

      </main>
    </div>
  );
}
