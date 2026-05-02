import { useState } from 'react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../lib/errorUtils';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight, Sun, Moon, Sunrise } from 'lucide-react';

interface BehaviouralFormProps {
  onComplete: () => void;
}

// Day name → int mapping: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
const DAY_TO_INT: Record<string, number> = {
  Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4,
  Thursday: 5, Friday: 6, Saturday: 7,
};

// Snap time string to nearest 30-min slot (backend requires minutes = 0 or 30)
const snapToHalfHour = (t: string): string => {
  const [h, m] = t.split(':').map(Number);
  const snapped = m < 15 ? 0 : m < 45 ? 30 : 0;
  const hour = snapped === 0 && m >= 45 ? (h + 1) % 24 : h;
  return `${String(hour).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
};

export const BehaviouralForm = ({ onComplete }: BehaviouralFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    chronotype: 'intermediate',
    wake_time: '07:00',
    sleep_time: '23:00',
    peak_energy_start: '09:00',
    peak_energy_end: '12:00',
    preferred_study_style: 'long_blocks',
    max_focus_duration_mins: '60',
    daily_commitment_hrs: '4',
    heavy_days: [] as string[],
    light_days: [] as string[],
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleDayToggle = (type: 'heavy_days' | 'light_days', day: string) => {
    setFormData(prev => {
      const isSelected = prev[type].includes(day);
      const opposite = type === 'heavy_days' ? 'light_days' : 'heavy_days';
      const newList = isSelected
        ? prev[type].filter(d => d !== day)
        : [...prev[type], day];
      // Remove from opposite list to prevent overlap validation error
      const newOpposite = prev[opposite].filter(d => d !== day);
      return { ...prev, [type]: newList, [opposite]: newOpposite };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/behavioural-profile', {
        wake_time: snapToHalfHour(formData.wake_time),
        sleep_time: snapToHalfHour(formData.sleep_time),
        chronotype: formData.chronotype,
        peak_energy_start: snapToHalfHour(formData.peak_energy_start),
        peak_energy_end: snapToHalfHour(formData.peak_energy_end),
        preferred_study_style: formData.preferred_study_style,
        max_focus_duration_mins: parseInt(formData.max_focus_duration_mins, 10),
        daily_commitment_hrs: parseFloat(formData.daily_commitment_hrs),
        heavy_days: formData.heavy_days.map(d => DAY_TO_INT[d]),
        light_days: formData.light_days.map(d => DAY_TO_INT[d]),
      });
      onComplete();
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Failed to save behavioural profile'),
      });
    } finally {
      setLoading(false);
    }
  };

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Chronotype */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Chronotype</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            {[
              { id: 'early_bird', label: 'Morning Lark', icon: Sunrise },
              { id: 'intermediate', label: 'Neutral', icon: Sun },
              { id: 'night_owl', label: 'Night Owl', icon: Moon },
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
                  color: formData.chronotype === type.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}
              >
                {(() => { const Icon = type.icon; return <Icon size={24} style={{ margin: '0 auto 0.5rem' }} />; })()}
                <div style={{ fontSize: '14px', fontWeight: 500 }}>{type.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Wake / Sleep time */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Wake Time</label>
            <input type="time" name="wake_time" value={formData.wake_time} onChange={handleChange}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Sleep Time</label>
            <input type="time" name="sleep_time" value={formData.sleep_time} onChange={handleChange}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Peak Energy */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Peak Energy Start</label>
            <input type="time" name="peak_energy_start" required value={formData.peak_energy_start} onChange={handleChange}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Peak Energy End</label>
            <input type="time" name="peak_energy_end" required value={formData.peak_energy_end} onChange={handleChange}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Study Style */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Preferred Study Style</label>
          <select name="preferred_study_style" value={formData.preferred_study_style} onChange={handleChange}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="pomodoro">Pomodoro (25/5)</option>
            <option value="long_blocks">Long Focus Blocks</option>
            <option value="short_bursts">Short Bursts</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>

        {/* Max Focus */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Max Focus Duration: {formData.max_focus_duration_mins} mins</label>
          <input type="range" min="10" max="180" step="10" name="max_focus_duration_mins"
            value={formData.max_focus_duration_mins} onChange={handleChange} style={{ width: '100%' }} />
        </div>

        {/* Daily Commitment */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Daily Study Commitment: {formData.daily_commitment_hrs}h</label>
          <input type="range" min="0.5" max="12" step="0.5" name="daily_commitment_hrs"
            value={formData.daily_commitment_hrs} onChange={handleChange} style={{ width: '100%' }} />
        </div>

        {/* Heavy Days */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Heavy Study Days</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {days.map(day => (
              <button key={day} type="button" onClick={() => handleDayToggle('heavy_days', day)}
                style={{
                  background: formData.heavy_days.includes(day) ? 'var(--primary-500)' : 'transparent',
                  color: formData.heavy_days.includes(day) ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${formData.heavy_days.includes(day) ? 'var(--primary-500)' : 'var(--border-subtle)'}`,
                  padding: '4px 12px', borderRadius: '16px', cursor: 'pointer', fontSize: '12px',
                }}>
                {day.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Light Days */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Light / Rest Days</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {days.map(day => (
              <button key={day} type="button" onClick={() => handleDayToggle('light_days', day)}
                style={{
                  background: formData.light_days.includes(day) ? 'var(--success)' : 'transparent',
                  color: formData.light_days.includes(day) ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${formData.light_days.includes(day) ? 'var(--success)' : 'var(--border-subtle)'}`,
                  padding: '4px 12px', borderRadius: '16px', cursor: 'pointer', fontSize: '12px',
                }}>
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
