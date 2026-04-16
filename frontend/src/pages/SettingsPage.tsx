import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { client } from '../api/client';
import { User, Shield, Power, MessageSquare, LogOut, ChevronRight, Download } from 'lucide-react';

export default function SettingsPage() {
  const { logout, userName } = useAuthStore();
  const { addToast, openModal } = useUIStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'account' | 'feedback'>('profile');

  // Form states
  const [passwordForm, setPasswordForm] = useState({ current: '', new_password: '' });
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
       // logout handles redirect internally
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.current || !passwordForm.new_password) {
      addToast({ type: 'warning', message: 'Please fill out both fields' });
      return;
    }
    setIsSubmitting(true);
    try {
      await client.post('/users/me/change-password', {
        old_password: passwordForm.current,
        new_password: passwordForm.new_password
      });
      addToast({ type: 'success', message: 'Password updated successfully' });
      setPasswordForm({ current: '', new_password: '' });
    } catch (err: any) {
      addToast({ type: 'error', message: err.message || 'Failed to update password' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    try {
      await client.post('/users/me/feedback', { message: feedback });
      addToast({ type: 'success', message: 'Thank you for your feedback!' });
      setFeedback('');
    } catch (err: any) {
      addToast({ type: 'error', message: err.message || 'Failed to submit feedback' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await client.get('/users/me/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'momentum_export.json');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      addToast({ type: 'error', message: 'Failed to export data' });
    }
  };

  const handleDeleteAccount = () => {
    openModal({
      name: 'confirm-delete',
      data: {
        title: 'Delete Account',
        onConfirm: async () => {
          try {
            await client.delete('/users/me');
            await logout();
          } catch (err: any) {
            addToast({ type: 'error', message: err.message || 'Failed to delete account' });
          }
        }
      }
    });
  };

  const tabs = [
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'account', icon: Power, label: 'Account Data' },
    { id: 'feedback', icon: MessageSquare, label: 'Feedback' },
  ] as const;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="mb-6 flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
           <p className="text-text-secondary mt-1">Manage your account and preferences.</p>
        </div>
        <button 
           onClick={handleLogout}
           className="flex items-center gap-2 text-danger hover:bg-danger/10 px-4 py-2 rounded-lg transition-colors"
        >
           <LogOut size={18} /> Logout
        </button>
      </header>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <nav className="w-full md:w-64 space-y-1">
           {tabs.map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id)}
               className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-colors ${
                 activeTab === tab.id 
                   ? 'bg-primary-500/10 text-primary-400 font-medium' 
                   : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
               }`}
             >
               <div className="flex items-center gap-3">
                 <tab.icon size={18} />
                 {tab.label}
               </div>
               {activeTab === tab.id && <ChevronRight size={16} />}
             </button>
           ))}
        </nav>

        {/* Content Pane */}
        <div className="flex-1 surface-card p-6 min-h-[400px]">
           {activeTab === 'profile' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
               <h2 className="text-xl font-semibold text-text-primary border-b border-border-subtle pb-3">Profile Info</h2>
               
               <div className="space-y-4 max-w-md">
                 <div>
                   <label className="block text-sm text-text-secondary mb-1">Display Name</label>
                   <input 
                     disabled
                     type="text" 
                     className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2 text-text-primary opacity-70" 
                     value={userName || 'User'} 
                   />
                 </div>
                 <div>
                   <label className="block text-sm text-text-secondary mb-1">Timezone</label>
                   <select className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2 text-text-primary">
                      <option>UTC</option>
                   </select>
                 </div>
                 <button className="bg-primary-500 hover:bg-primary-400 text-white px-4 py-2 rounded-md font-medium transition-colors">
                   Save Changes
                 </button>
               </div>
             </div>
           )}

           {activeTab === 'security' && (
             <form onSubmit={handlePasswordChange} className="space-y-6 animate-in slide-in-from-right-4 duration-300">
               <h2 className="text-xl font-semibold text-text-primary border-b border-border-subtle pb-3">Security</h2>
               
               <div className="space-y-4 max-w-md">
                 <div>
                   <label className="block text-sm text-text-secondary mb-1">Current Password</label>
                   <input 
                     type="password"
                     value={passwordForm.current}
                     onChange={e => setPasswordForm(p => ({ ...p, current: e.target.value }))}
                     className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2 text-text-primary" 
                   />
                 </div>
                 <div>
                   <label className="block text-sm text-text-secondary mb-1">New Password</label>
                   <input 
                     type="password"
                     value={passwordForm.new_password}
                     onChange={e => setPasswordForm(p => ({ ...p, new_password: e.target.value }))}
                     className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2 text-text-primary" 
                   />
                 </div>
                 <button disabled={isSubmitting} type="submit" className="bg-primary-500 hover:bg-primary-400 text-white px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50">
                   Update Password
                 </button>
               </div>
             </form>
           )}

           {activeTab === 'account' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
               <h2 className="text-xl font-semibold text-text-primary border-b border-border-subtle pb-3">Account Data</h2>
               
               <div className="space-y-4">
                 <div className="bg-bg-surface p-4 rounded-lg border border-border-subtle flex items-center justify-between">
                   <div>
                     <h3 className="text-text-primary font-medium">Export Data</h3>
                     <p className="text-sm text-text-muted">Download all your records as JSON</p>
                   </div>
                   <button onClick={handleExportData} className="text-primary-400 font-medium flex items-center gap-2 hover:underline">
                     <Download size={16} /> Download
                   </button>
                 </div>

                 <div className="bg-danger/5 p-4 rounded-lg border border-danger/20 flex flex-col items-start">
                   <h3 className="text-danger font-medium mb-1">Danger Zone</h3>
                   <p className="text-sm text-text-muted mb-4">Deleting your account is permanent and cannot be undone.</p>
                   <button onClick={handleDeleteAccount} className="bg-danger hover:bg-red-600 text-white px-4 py-2 rounded-md font-medium transition-colors">
                     Delete Account
                   </button>
                 </div>
               </div>
             </div>
           )}

           {activeTab === 'feedback' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
               <h2 className="text-xl font-semibold text-text-primary border-b border-border-subtle pb-3">Give Feedback</h2>
               <div className="space-y-4 max-w-lg">
                 <textarea 
                   value={feedback}
                   onChange={e => setFeedback(e.target.value)}
                   className="w-full h-32 bg-bg-surface border border-border-subtle rounded-lg px-4 py-3 text-text-primary resize-none focus:outline-none focus:border-primary-500" 
                   placeholder="Tell us what you think or report a bug..."
                 ></textarea>
                 <button 
                   disabled={isSubmitting || !feedback.trim()}
                   onClick={handleFeedbackSubmit} 
                   className="bg-primary-500 hover:bg-primary-400 text-white px-4 py-2 rounded-md font-medium transition-colors w-full disabled:opacity-50"
                 >
                   Submit Feedback
                 </button>
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
