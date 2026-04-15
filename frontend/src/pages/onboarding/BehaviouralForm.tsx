import { useState } from 'react';
import { client } from '../../api/client';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight, Sun, Moon, Sunrise } from 'lucide-react';

interface BehaviouralFormProps {
  onComplete: () => void;
}

export const BehaviouralForm = ({ onComplete }: BehaviouralFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    chronotype: 'Neutral',
    peak_energy_start: '09:00',
    peak_energy_end: '12:00',
    study_style: 'Deep Work',
    max_focus_mins: '60',
    daily_commitment_hrs: '4',
    heavy_days: [] as string[],
    light_days: [] as string[]
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleDayToggle = (type: 'heavy_days' | 'light_days', day: string) => {
    setFormData(prev => {
      const isSelected = prev[type].includes(day);
      let newList = [];
      if (isSelected) {
        newList = prev[type].filter(d => d !== day);
      } else {
        newList = [...prev[type], day];
      }
      return { ...prev, [type]: newList };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/behavioural-profile', {
        wake_time: "07:00:00", // Defaulting for simple UI
        sleep_time: "23:00:00",
        chronotype: formData.chronotype,
        peak_energy_start: `${formData.peak_energy_start}:00`,
        peak_energy_end: `${formData.peak_energy_end}:00`,
        study_style: formData.study_style,
        max_focus_duration_minutes: parseInt(formData.max_focus_mins, 10),
        daily_commitment_hours: parseInt(formData.daily_commitment_hrs, 10),
        heavy_days: formData.heavy_days,
        light_days: formData.light_days
      });
      onComplete();
    } catch (error: any) {
      addToast({
        type: 'error',
        message: error.response?.data?.detail || 'Failed to save behavioural profile',
      });
    } finally {
      setLoading(false);
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Chronotype</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            {[
              { id: 'Morning Lark', icon: Sunrise },
              { id: 'Neutral', icon: Sun },
              { id: 'Night Owl', icon: Moon }
            ].map(type => (
              <div 
                key={type.id}
                onClick={() => setFormData(p => ({ ...p, chronotype: type.id }))}
                style={{
                  border: `1px solid ${formData.chronotype === type.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  background: formData.chronotype === type.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  color: formData.chronotype === type.id ? 'var(--accent-primary)' : 'var(--text-secondary)'
                }}
              >
                {(() => {
                  const Icon = type.icon;
                  return <Icon size={24} style={{ margin: '0 auto 0.5rem' }} />;
                })()}
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{type.id}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Peak Energy Start</label>
            <input 
              type="time" 
              name="peak_energy_start" 
              required 
              value={formData.peak_energy_start} 
              onChange={handleChange} 
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Peak Energy End</label>
            <input 
              type="time" 
              name="peak_energy_end" 
              required 
              value={formData.peak_energy_end} 
              onChange={handleChange} 
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Max Focus Duration: {formData.max_focus_mins} mins</label>
          <input 
            type="range" 
            min="10" max="180" step="10" 
            name="max_focus_mins" 
            value={formData.max_focus_mins} 
            onChange={handleChange} 
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Heavy Study Days</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {days.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => handleDayToggle('heavy_days', day)}
                style={{
                  background: formData.heavy_days.includes(day) ? 'var(--primary-500)' : 'transparent',
                  color: formData.heavy_days.includes(day) ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${formData.heavy_days.includes(day) ? 'var(--primary-500)' : 'var(--border-subtle)'}`,
                  padding: '4px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

      </div>

      <div className={classes.formActions}>
        <button type="submit" className={classes.btnPrimary} disabled={loading}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Continue'}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </form>
  );
};
