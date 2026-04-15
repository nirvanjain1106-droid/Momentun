import { useState } from 'react';
import { client } from '../../api/client';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight } from 'lucide-react';

interface AcademicFormProps {
  onComplete: () => void;
}

export const AcademicForm = ({ onComplete }: AcademicFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    college: '',
    course: '',
    year: '1',
    cgpa: '',
    self_rating: 'Average',
    schedule_type: 'Regular',
    intern_company: '',
    intern_hours: '0'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/academic-profile', {
        college_university: formData.college,
        course_major: formData.course,
        current_year: parseInt(formData.year, 10),
        cgpa: parseFloat(formData.cgpa) || null,
        self_rating: formData.self_rating,
        schedule_type: formData.schedule_type,
        // Mock conditionals - backend drops if not intern
        internship_company: formData.schedule_type === 'Internship' ? formData.intern_company : null,
        internship_hours_per_week: formData.schedule_type === 'Internship' ? parseInt(formData.intern_hours, 10) : null
      });
      
      onComplete();
    } catch (error: any) {
      addToast({
        type: 'error',
        message: error.response?.data?.detail || 'Failed to save academic profile format',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>College / University</label>
          <input 
            type="text" 
            name="college" 
            required 
            value={formData.college} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
            placeholder="e.g. MIT, Stanford"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Course / Major</label>
          <input 
            type="text" 
            name="course" 
            required 
            value={formData.course} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
            placeholder="e.g. Computer Science"
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Year of Study</label>
            <select name="year" value={formData.year} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              {[1, 2, 3, 4, 5, 6].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>CGPA (Optional)</label>
            <input 
              type="number" 
              step="0.1" 
              name="cgpa" 
              value={formData.cgpa} 
              onChange={handleChange} 
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
              placeholder="e.g. 3.8"
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Schedule Type</label>
          <select name="schedule_type" value={formData.schedule_type} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="Regular">Full-time Student</option>
            <option value="Internship">Student + Internship</option>
            <option value="Working Professional">Working Professional</option>
          </select>
        </div>

        {formData.schedule_type === 'Internship' && (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Company</label>
              <input type="text" name="intern_company" value={formData.intern_company} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} placeholder="e.g. Google" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Hours/Week</label>
              <input type="number" name="intern_hours" value={formData.intern_hours} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} placeholder="e.g. 20" />
            </div>
          </div>
        )}

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
