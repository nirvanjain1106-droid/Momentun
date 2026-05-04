import { useState, useEffect } from 'react';
import { 
  ArrowLeft, ChevronRight, User, Lock, Mail, Link as LinkIcon, 
  Bell, BarChart2, Clock, Target, Flame, Timer, Coffee, Moon, 
  Volume2, Palette, Globe, Calendar, Sparkles, Cpu, Download, 
  Shield, FileText, Trash2, HelpCircle, MessageCircle, Star, Info, Check
} from 'lucide-react';
import { userApi, logout } from '../../api/userApi';
import { useGlassMode } from '../../lib/useGlassMode';

interface Props {
  navigate: (screen: string) => void;
}

const DEFAULT_PREFS = {
  pushNotifications: true,
  dailySummary: true,
  focusReminders: true,
  goalMilestones: true,
  streakAlerts: true,
  focusMode: false,
  soundHaptics: true,
  aiCoachInsights: true,
  dataForAi: true,
  defaultSessionLength: '25 min',
  breakDuration: '5 min',
  coachingStyle: 'Motivational',
  theme: 'Light',
  language: 'English',
  dateFormat: 'DD/MM/YYYY',
};

type Prefs = typeof DEFAULT_PREFS;

const SectionLabel = ({ text }: { text: string }) => (
  <div className="text-[11px] font-semibold text-[#9C8880] uppercase tracking-[0.08em] mb-[8px] ml-2">
    {text}
  </div>
);

const SectionRow = ({
  icon: Icon,
  iconColor = "#1A1210",
  iconBg = "#F5E8E4",
  label,
  sublabel,
  rightContent,
  onClick,
  isLast = false,
  labelColor = "#1A1210"
}: any) => (
  <div 
    onClick={onClick}
    className={`h-[56px] flex items-center justify-between px-4 hover:bg-[#FAF6F2] transition-colors ${onClick ? 'cursor-pointer' : ''} ${!isLast ? 'border-b-[0.5px] border-[#EDE5DE]' : ''}`}
  >
    <div className="flex items-center gap-3 overflow-hidden">
      <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
        <Icon size={20} color={iconColor} />
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-[15px] truncate" style={{ color: labelColor }}>{label}</span>
        {sublabel && (
          <span className="text-[12px] text-[#9C8880] truncate leading-tight">{sublabel}</span>
        )}
      </div>
    </div>
    <div className="flex-shrink-0 ml-2">
      {rightContent}
    </div>
  </div>
);

const Toggle = ({ isOn }: { isOn: boolean }) => (
  <div className={`w-[44px] h-[24px] rounded-full transition-colors relative flex items-center ${isOn ? 'bg-[#B8472A]' : 'bg-[#EDE5DE]'}`}>
    <div className={`absolute w-[20px] h-[20px] bg-white rounded-full transition-transform shadow-sm top-[2px] ${isOn ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
  </div>
);

export default function ScreenSettings({ navigate }: Props) {
  const [email, setEmail] = useState<string>('');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const { glassEnabled, setGlass } = useGlassMode();
  
  // Toast State
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  // Bottom Sheet State
  const [bottomSheet, setBottomSheet] = useState<{
    open: boolean;
    title: string;
    options: string[];
    selectedValue: string;
    prefKey: keyof Prefs | null;
  }>({
    open: false,
    title: '',
    options: [],
    selectedValue: '',
    prefKey: null,
  });

  // Modal State
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    body: string;
    confirmText: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    body: '',
    confirmText: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    // Load email
    userApi.getProfile().then((data: any) => {
      if (data && data.email) {
        setEmail(data.email);
      }
    });

    // Load preferences
    const stored = localStorage.getItem('momentum_preferences');
    if (stored) {
      try {
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
      } catch (e) {
        console.error('Failed to parse preferences');
      }
    }
  }, []);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => {
      setToast(t => ({ ...t, visible: false }));
    }, 3000);
  };

  const updatePreference = (key: keyof Prefs, value: any) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    localStorage.setItem('momentum_preferences', JSON.stringify(newPrefs));
  };

  const handleToggle = (key: keyof Prefs) => {
    updatePreference(key, !prefs[key]);
  };

  const openSheet = (title: string, options: string[], prefKey: keyof Prefs) => {
    setBottomSheet({
      open: true,
      title,
      options,
      selectedValue: prefs[prefKey] as string,
      prefKey,
    });
  };

  const selectSheetOption = (option: string) => {
    if (bottomSheet.prefKey) {
      if (bottomSheet.prefKey === 'theme' && option === 'Dark') {
        showToast('Dark mode coming soon');
        // keep Light
        updatePreference(bottomSheet.prefKey, 'Light');
      } else {
        updatePreference(bottomSheet.prefKey, option);
      }
    }
    setBottomSheet(prev => ({ ...prev, open: false }));
  };

  const confirmDeleteAccount = () => {
    setModal({
      open: true,
      title: 'Delete Account',
      body: 'This will permanently delete all your goals, tasks, and progress. This cannot be undone.',
      confirmText: 'Delete Forever',
      onConfirm: async () => {
        setModal(prev => ({ ...prev, open: false }));
        await userApi.deleteAccount();
        navigate('login');
      }
    });
  };

  const confirmSignOut = () => {
    setModal({
      open: true,
      title: 'Sign Out',
      body: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
      onConfirm: async () => {
        setModal(prev => ({ ...prev, open: false }));
        await logout();
        navigate('login');
      }
    });
  };

  return (
    <div className="min-h-screen w-[390px] mx-auto bg-[#FAF6F2] font-sans flex flex-col relative overflow-hidden text-[#1A1210]">
      
      {/* STATUS BAR */}
      <div className="h-[54px] w-full flex-shrink-0 bg-transparent" />

      {/* HEADER */}
      <div className="h-[56px] flex items-center px-4 flex-shrink-0 relative">
        <button 
          onClick={() => navigate('profile')}
          className="p-2 -ml-2 rounded-full hover:bg-[#F2EDE8] transition-colors"
        >
          <ArrowLeft size={24} color="#1A1210" />
        </button>
        <div className="absolute left-0 right-0 pointer-events-none flex justify-center">
          <span className="text-[17px] font-semibold text-[#1A1210]">Settings</span>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
        
        {/* SECTION 1 — ACCOUNT */}
        <div>
          <SectionLabel text="ACCOUNT" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={User} iconColor="#B8472A" label="Edit Profile" sublabel="Name, photo, bio"
              rightContent={<ChevronRight size={20} color="#9C8880" />}
            />
            <SectionRow 
              icon={Lock} iconColor="#B8472A" label="Change Password" sublabel="Update your password"
              rightContent={<ChevronRight size={20} color="#9C8880" />}
            />
            <SectionRow 
              icon={Mail} iconColor="#B8472A" label="Email Address" sublabel={email || 'Loading...'}
              rightContent={<ChevronRight size={20} color="#9C8880" />}
            />
            <SectionRow 
              icon={LinkIcon} iconColor="#B8472A" label="Connected Accounts" sublabel="Google, Apple"
              rightContent={<ChevronRight size={20} color="#9C8880" />}
              isLast={true}
            />
          </div>
        </div>

        {/* SECTION 2 — NOTIFICATIONS */}
        <div>
          <SectionLabel text="NOTIFICATIONS" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={Bell} iconColor="#B8472A" label="Push Notifications" sublabel="Task reminders and updates"
              rightContent={<Toggle isOn={prefs.pushNotifications} />}
              onClick={() => handleToggle('pushNotifications')}
            />
            <SectionRow 
              icon={BarChart2} iconColor="#B8472A" label="Daily Summary" sublabel="Receive your daily progress digest"
              rightContent={<Toggle isOn={prefs.dailySummary} />}
              onClick={() => handleToggle('dailySummary')}
            />
            <SectionRow 
              icon={Clock} iconColor="#B8472A" label="Focus Reminders" sublabel="Remind me to start focus sessions"
              rightContent={<Toggle isOn={prefs.focusReminders} />}
              onClick={() => handleToggle('focusReminders')}
            />
            <SectionRow 
              icon={Target} iconColor="#B8472A" label="Goal Milestones" sublabel="Celebrate progress milestones"
              rightContent={<Toggle isOn={prefs.goalMilestones} />}
              onClick={() => handleToggle('goalMilestones')}
            />
            <SectionRow 
              icon={Flame} iconColor="#D4920A" iconBg="#FEF9EE" label="Streak Alerts" sublabel="Don't lose your streak!"
              rightContent={<Toggle isOn={prefs.streakAlerts} />}
              onClick={() => handleToggle('streakAlerts')}
              isLast={true}
            />
          </div>
        </div>

        {/* SECTION 3 — FOCUS SETTINGS */}
        <div>
          <SectionLabel text="FOCUS" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={Timer} iconColor="#B8472A" label="Default Session Length"
              rightContent={<div className="flex items-center gap-1"><span className="text-[13px] text-[#B8472A]">{prefs.defaultSessionLength}</span><ChevronRight size={16} color="#B8472A" /></div>}
              onClick={() => openSheet('Default Session Length', ['15 min', '25 min', '45 min', '60 min', '90 min'], 'defaultSessionLength')}
            />
            <SectionRow 
              icon={Coffee} iconColor="#B8472A" label="Break Duration"
              rightContent={<div className="flex items-center gap-1"><span className="text-[13px] text-[#B8472A]">{prefs.breakDuration}</span><ChevronRight size={16} color="#B8472A" /></div>}
              onClick={() => openSheet('Break Duration', ['5 min', '10 min', '15 min', '20 min'], 'breakDuration')}
            />
            <SectionRow 
              icon={Moon} iconColor="#B8472A" label="Focus Mode" sublabel="Block distracting apps during sessions"
              rightContent={<Toggle isOn={prefs.focusMode} />}
              onClick={() => handleToggle('focusMode')}
            />
            <SectionRow 
              icon={Volume2} iconColor="#B8472A" label="Sound & Haptics" sublabel="Session start and end sounds"
              rightContent={<Toggle isOn={prefs.soundHaptics} />}
              onClick={() => handleToggle('soundHaptics')}
              isLast={true}
            />
          </div>
        </div>

        {/* SECTION 4 — APPEARANCE */}
        <div>
          <SectionLabel text="APPEARANCE" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={Palette} iconColor="#B8472A" label="Theme"
              rightContent={<div className="flex items-center gap-1"><span className="text-[13px] text-[#9C8880]">{prefs.theme}</span><ChevronRight size={16} color="#9C8880" /></div>}
              onClick={() => openSheet('Theme', ['Light', 'Dark', 'System'], 'theme')}
            />
            <SectionRow 
              icon={Globe} iconColor="#B8472A" label="Language"
              rightContent={<div className="flex items-center gap-1"><span className="text-[13px] text-[#9C8880]">{prefs.language}</span><ChevronRight size={16} color="#9C8880" /></div>}
            />
            <SectionRow 
              icon={Calendar} iconColor="#B8472A" label="Date Format"
              rightContent={<div className="flex items-center gap-1"><span className="text-[13px] text-[#9C8880]">{prefs.dateFormat}</span><ChevronRight size={16} color="#9C8880" /></div>}
              onClick={() => openSheet('Date Format', ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], 'dateFormat')}
            />
            <SectionRow 
              icon={Sparkles} iconColor="#B8472A" label="Liquid Glass Mode" sublabel="Translucent blur effects"
              rightContent={<Toggle isOn={glassEnabled} />}
              onClick={() => setGlass(!glassEnabled)}
              isLast={true}
            />
          </div>
        </div>

        {/* SECTION 5 — AI COACH */}
        <div>
          <SectionLabel text="AI COACH" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={() => <div className="w-[32px] h-[32px] rounded-full bg-[#F5E8E4] flex items-center justify-center"><Sparkles size={20} color="#B8472A" /></div>} 
              iconColor="#B8472A" iconBg="transparent" label="AI Coach Insights" sublabel="Personalised daily recommendations"
              rightContent={<Toggle isOn={prefs.aiCoachInsights} />}
              onClick={() => handleToggle('aiCoachInsights')}
            />
            <SectionRow 
              icon={Sparkles} iconColor="#B8472A" label="Coaching Style"
              rightContent={<div className="flex items-center gap-1"><span className="text-[13px] text-[#9C8880]">{prefs.coachingStyle}</span><ChevronRight size={16} color="#9C8880" /></div>}
              onClick={() => openSheet('Coaching Style', ['Motivational', 'Analytical', 'Gentle', 'Direct'], 'coachingStyle')}
            />
            <SectionRow 
              icon={Cpu} iconColor="#B8472A" label="Share Data with AI" sublabel="Goals, tasks, and focus patterns"
              rightContent={<Toggle isOn={prefs.dataForAi} />}
              onClick={() => handleToggle('dataForAi')}
              isLast={true}
            />
          </div>
        </div>

        {/* SECTION 6 — DATA & PRIVACY */}
        <div>
          <SectionLabel text="DATA & PRIVACY" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={Download} iconColor="#B8472A" label="Export My Data" sublabel="Download all your Momentum data"
              rightContent={<ChevronRight size={20} color="#9C8880" />}
              onClick={async () => {
                await userApi.exportData();
                showToast('Your data export has been sent to your email');
              }}
            />
            <SectionRow 
              icon={Shield} iconColor="#B8472A" label="Privacy Policy"
              rightContent={<Info size={16} color="#9C8880" />}
              onClick={() => window.open('https://momentum.app/privacy', '_blank')}
            />
            <SectionRow 
              icon={FileText} iconColor="#B8472A" label="Terms of Service"
              rightContent={<Info size={16} color="#9C8880" />}
            />
            <SectionRow 
              icon={Trash2} iconColor="#C0392B" iconBg="#FEF0EE" label="Delete Account" labelColor="#C0392B" sublabel="Permanently delete all your data"
              rightContent={<ChevronRight size={20} color="#C0392B" />}
              onClick={confirmDeleteAccount}
              isLast={true}
            />
          </div>
        </div>

        {/* SECTION 7 — SUPPORT */}
        <div>
          <SectionLabel text="SUPPORT" />
          <div className="bg-[#FFFFFF] border border-[#EDE5DE] rounded-[16px] overflow-hidden shadow-[0_2px_8px_rgba(26,18,16,0.06),0_0_1px_rgba(26,18,16,0.08)]">
            <SectionRow 
              icon={HelpCircle} iconColor="#B8472A" label="Help Center"
              rightContent={<Info size={16} color="#9C8880" />}
            />
            <SectionRow 
              icon={MessageCircle} iconColor="#B8472A" label="Send Feedback"
              rightContent={<ChevronRight size={20} color="#9C8880" />}
              onClick={() => window.location.href = 'mailto:support@momentum.app'}
            />
            <SectionRow 
              icon={Star} iconColor="#D4920A" iconBg="#FEF9EE" label="Rate Momentum"
              rightContent={<span className="text-[15px]">⭐⭐⭐⭐⭐</span>}
            />
            <SectionRow 
              icon={Info} iconColor="#B8472A" label="App Version"
              rightContent={<span className="text-[13px] text-[#9C8880]">1.0.0</span>}
              isLast={true}
            />
          </div>
        </div>

        {/* SIGN OUT BUTTON */}
        <button 
          onClick={confirmSignOut}
          className="w-full mt-2 h-[52px] bg-[#FEF0EE] border border-[#FCCFC9] rounded-[12px] flex items-center justify-center text-[15px] font-semibold text-[#C0392B] focus:outline-none focus:ring-2 focus:ring-[#C0392B] focus:ring-opacity-50"
        >
          Sign Out
        </button>

        {/* APP SIGNATURE */}
        <div className="mt-6 mb-8 text-center text-[12px] text-[#9C8880]">
          Made with ❤️ by Momentum
        </div>
      </div>

      {/* BOTTOM SHEET */}
      {bottomSheet.open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity" 
            onClick={() => setBottomSheet(prev => ({ ...prev, open: false }))}
          />
          <div className="relative bg-white rounded-t-[20px] pt-[20px] px-4 pb-[34px] animate-[slideUp_0.3s_ease-out]">
            <div className="w-[40px] h-[4px] bg-[#EDE5DE] rounded-full mx-auto mb-4" />
            <h3 className="text-[17px] font-semibold text-[#1A1210] mb-4 text-center">{bottomSheet.title}</h3>
            <div className="flex flex-col">
              {bottomSheet.options.map((option, idx) => {
                const isSelected = option === bottomSheet.selectedValue;
                return (
                  <div key={idx} className="relative">
                    <button 
                      onClick={() => selectSheetOption(option)}
                      className={`w-full h-[52px] flex items-center justify-between focus:outline-none ${idx !== 0 ? 'border-t-[0.5px] border-[#EDE5DE]' : ''}`}
                    >
                      <span className={`text-[15px] ${isSelected ? 'font-semibold text-[#B8472A]' : 'text-[#1A1210]'}`}>
                        {option}
                      </span>
                      {isSelected && <Check size={20} color="#B8472A" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DIALOG */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/40" 
            onClick={() => setModal(prev => ({ ...prev, open: false }))}
          />
          <div className="relative w-[320px] bg-white rounded-[16px] p-6 shadow-xl text-center animate-[zoomIn_0.2s_ease-out]">
            <h3 className="text-[17px] font-semibold text-[#1A1210] mb-2">{modal.title}</h3>
            <p className="text-[14px] text-[#6B5C54] mb-6 leading-relaxed">{modal.body}</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={modal.onConfirm}
                className={`w-full h-[44px] rounded-[12px] text-[15px] font-semibold text-white ${modal.confirmText === 'Sign Out' || modal.confirmText === 'Delete Forever' ? 'bg-[#C0392B]' : 'bg-[#B8472A]'}`}
              >
                {modal.confirmText}
              </button>
              <button 
                onClick={() => setModal(prev => ({ ...prev, open: false }))}
                className="w-full h-[44px] rounded-[12px] text-[15px] font-semibold text-[#6B5C54] bg-[#F2EDE8]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast.visible && (
        <div className="fixed top-[70px] left-0 right-0 flex justify-center z-[100] animate-[fadeInDown_0.3s_ease-out]">
          <div className="bg-[#1A1210] text-white text-[14px] font-semibold px-5 py-2.5 rounded-full shadow-lg">
            {toast.message}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
