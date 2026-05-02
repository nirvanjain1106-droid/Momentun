import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Battery, Zap, AlertCircle } from 'lucide-react';
import { client } from '../api/client';
import { useUIStore } from '../stores/uiStore';

export default function MorningCheckinPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [energy, setEnergy] = useState<string>('');
  const [yesterday, setYesterday] = useState<string>('');
  const [surprise, setSurprise] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await client.post('/checkin/morning', {
        energy_level: energy,
        yesterday_rating: yesterday,
        surprise_event: surprise
      });
      navigate('/home');
    } catch {
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to submit check-in' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="max-w-xl w-full">
        
        <div className="flex items-center justify-center mb-10">
          <div className="bg-primary-500/20 p-4 rounded-full">
            <Sun size={32} className="text-primary-400" />
          </div>
        </div>

        {step === 1 && (
          <div className="surface-card p-8 text-center animate-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-text-primary mb-6">How are your energy levels this morning?</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { id: 'high', label: 'High', icon: Zap, color: 'text-success' },
                { id: 'medium', label: 'Medium', icon: Battery, color: 'text-info' },
                { id: 'low', label: 'Low', icon: Battery, color: 'text-warning' },
                { id: 'exhausted', label: 'Exhausted', icon: AlertCircle, color: 'text-danger' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setEnergy(opt.id); setStep(2); }}
                  className="bg-bg-surface hover:bg-bg-hover border border-border-subtle p-4 rounded-xl flex flex-col items-center gap-3 transition-colors"
                >
                  <opt.icon size={28} className={opt.color} />
                  <span className="font-medium text-text-primary">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="surface-card p-8 text-center animate-in slide-in-from-right-8 duration-500">
            <h2 className="text-2xl font-bold text-text-primary mb-6">How did yesterday go?</h2>
            
            <div className="space-y-3">
              {[
                { id: 'crushed', label: 'Crushed it' },
                { id: 'decent', label: 'Decent' },
                { id: 'rough', label: 'Rough' },
                { id: 'survival', label: 'Barely survived' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setYesterday(opt.id); setStep(3); }}
                  className="w-full bg-bg-surface hover:bg-bg-hover border border-border-subtle p-4 rounded-xl font-medium text-text-primary transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="mt-6 text-sm text-text-muted hover:text-text-primary">Back</button>
          </div>
        )}

        {step === 3 && (
          <div className="surface-card p-8 text-center animate-in slide-in-from-right-8 duration-500">
            <h2 className="text-2xl font-bold text-text-primary mb-6">Any surprise events yesterday?</h2>
            
            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto no-scrollbar pb-2">
              {[
                { id: 'none', label: 'None' },
                { id: 'sick', label: 'Got sick' },
                { id: 'emergency', label: 'Family/Friend Emergency' },
                { id: 'work', label: 'Unexpected Work/School Load' },
                { id: 'distracted', label: 'Heavily distracted' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSurprise(opt.id)}
                  className={`w-full p-4 rounded-xl font-medium transition-colors border ${
                    surprise === opt.id 
                      ? 'bg-primary-500/20 border-primary-500 text-primary-400' 
                      : 'bg-bg-surface hover:bg-bg-hover border-border-subtle text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            
            <button 
              disabled={!surprise || submitting}
              onClick={handleSubmit}
              className="w-full bg-primary-500 hover:bg-primary-400 text-white p-4 rounded-xl font-bold flex justify-center disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Finish Check-in'}
            </button>
            <button onClick={() => setStep(2)} className="mt-6 text-sm text-text-muted hover:text-text-primary">Back</button>
          </div>
        )}

      </div>
    </div>
  );
}
