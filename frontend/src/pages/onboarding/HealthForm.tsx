import { useState } from 'react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../lib/errorUtils';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight } from 'lucide-react';

interface HealthFormProps {
  onComplete: () => void;
}

export const HealthForm = ({ onComplete }: HealthFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    sleep_quality: 'good',
    average_sleep_hrs: '7',
    current_fitness_level: 'lightly_active',
    diet_type: 'no_preference',
    has_afternoon_crash: false,
    has_chronic_fatigue: false,
    has_focus_difficulty: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSkip = () => {
    // Health is optional — skip without posting
    onComplete();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/health-profile', {
        has_physical_limitation: false,
        physical_limitation_note: null,
        sleep_quality: formData.sleep_quality,
        average_sleep_hrs: parseFloat(formData.average_sleep_hrs),
        has_afternoon_crash: formData.has_afternoon_crash,
        has_chronic_fatigue: formData.has_chronic_fatigue,
        has_focus_difficulty: formData.has_focus_difficulty,
        focus_note: null,
        current_fitness_level: formData.current_fitness_level,
        diet_type: formData.diet_type,
      });
      onComplete();
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Failed to save health profile'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Typical Sleep Quality</label>
          <select name="sleep_quality" value={formData.sleep_quality} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="poor">Poor</option>
            <option value="irregular">Irregular</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Average Sleep Hours ({formData.average_sleep_hrs}h)</label>
          <input
            type="range"
            min="3" max="12" step="0.5"
            name="average_sleep_hrs"
            value={formData.average_sleep_hrs}
            onChange={handleChange}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Fitness Level</label>
          <select name="current_fitness_level" value={formData.current_fitness_level} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="sedentary">Sedentary</option>
            <option value="lightly_active">Light Activity</option>
            <option value="moderately_active">Moderately Active</option>
            <option value="very_active">Very Active</option>
            <option value="athlete">Athlete</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Diet Type</label>
          <select name="diet_type" value={formData.diet_type} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="no_preference">No Preference</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="non_vegetarian">Non-Vegetarian</option>
            <option value="vegan">Vegan</option>
            <option value="eggetarian">Eggetarian</option>
            <option value="jain">Jain</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Any of these apply to you?</label>
          {[
            { name: 'has_afternoon_crash', label: 'I often crash in the afternoon' },
            { name: 'has_chronic_fatigue', label: 'I experience chronic fatigue' },
            { name: 'has_focus_difficulty', label: 'I have difficulty focusing' },
          ].map(item => (
            <label key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name={item.name}
                checked={formData[item.name as keyof typeof formData] as boolean}
                onChange={handleChange}
              />
              {item.label}
            </label>
          ))}
        </div>

      </div>

      <div className={classes.formActions}>
        <button type="button" onClick={handleSkip} className={classes.btnSkip} disabled={loading}>
          Skip
        </button>
        <button type="submit" className={classes.btnPrimary} disabled={loading}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Continue'}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </form>
  );
};
