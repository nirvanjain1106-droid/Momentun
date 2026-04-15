import { useState } from 'react';
import { client } from '../../api/client';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight, Plus, Trash2 } from 'lucide-react';

interface FixedBlockEditorProps {
  onComplete: () => void;
}

interface Block {
  title: string;
  type: string;
  days: string[];
  start_time: string;
  end_time: string;
  is_hard_constraint: boolean;
}

export const FixedBlockEditor = ({ onComplete }: FixedBlockEditorProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  
  const [currentBlock, setCurrentBlock] = useState<Block>({
    title: '',
    type: 'class',
    days: [],
    start_time: '09:00',
    end_time: '10:00',
    is_hard_constraint: true
  });

  const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const addBlock = () => {
    if (!currentBlock.title || currentBlock.days.length === 0) {
      addToast({ type: 'error', message: 'Title and at least one day are required.' });
      return;
    }
    // simple overlap validation
    if (currentBlock.start_time >= currentBlock.end_time) {
      addToast({ type: 'error', message: 'End time must be after start time' });
      return;
    }

    setBlocks(prev => [...prev, currentBlock]);
    
    // reset current
    setCurrentBlock({
      title: '',
      type: 'class',
      days: [],
      start_time: '09:00',
      end_time: '10:00',
      is_hard_constraint: true
    });
  };

  const removeBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDay = (day: string) => {
    setCurrentBlock(prev => {
      if (prev.days.includes(day)) {
        return { ...prev, days: prev.days.filter(d => d !== day) };
      }
      return { ...prev, days: [...prev.days, day] };
    });
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // API expects times in HH:MM:SS format
      const formattedBlocks = blocks.map(b => ({
        ...b,
        start_time: `${b.start_time}:00`,
        end_time: `${b.end_time}:00`
      }));

      await client.post('/onboarding/fixed-blocks', {
        blocks: formattedBlocks
      });
      onComplete();
    } catch (error: any) {
      addToast({
        type: 'error',
        message: error.response?.data?.detail || 'Failed to save fixed blocks',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
        <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Add a Fixed Block</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <input 
              placeholder="Block Title (e.g. Physics 101)" 
              value={currentBlock.title} 
              onChange={e => setCurrentBlock(p => ({ ...p, title: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
            />
          </div>
          <div>
            <select 
              value={currentBlock.type} 
              onChange={e => setCurrentBlock(p => ({ ...p, type: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
            >
              <option value="class">Class</option>
              <option value="work">Work</option>
              <option value="meal">Meal</option>
              <option value="fitness">Fitness</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {daysList.map(day => (
              <button 
                key={day} 
                type="button"
                onClick={() => toggleDay(day)}
                style={{
                  background: currentBlock.days.includes(day) ? 'var(--primary-500)' : 'transparent',
                  color: currentBlock.days.includes(day) ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${currentBlock.days.includes(day) ? 'var(--primary-500)' : 'var(--border-subtle)'}`,
                  padding: '2px 8px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer'
                }}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
             <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>From</label>
             <input type="time" value={currentBlock.start_time} onChange={e => setCurrentBlock(p => ({...p, start_time: e.target.value}))} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white' }} />
          </div>
          <div style={{ flex: 1 }}>
             <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>To</label>
             <input type="time" value={currentBlock.end_time} onChange={e => setCurrentBlock(p => ({...p, end_time: e.target.value}))} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white' }} />
          </div>
          <button type="button" onClick={addBlock} style={{ background: 'var(--bg-hover)', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '100px' }}>
        {blocks.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', margin: '2rem 0' }}>No blocks added yet.</p>
        ) : (
          blocks.map((b, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
              <div>
                <strong style={{ color: 'white', display: 'block' }}>{b.title}</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{b.days.map(d=>d.substring(0,3)).join(', ')} • {b.start_time} - {b.end_time}</span>
              </div>
              <button type="button" onClick={() => removeBlock(idx)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={classes.formActions}>
        <button type="button" onClick={handleSubmit} className={classes.btnPrimary} disabled={loading}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Continue'}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </div>
  );
};
