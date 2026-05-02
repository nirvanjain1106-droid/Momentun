import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StepProgress } from '../components/ui/StepProgress';
import { useAuthStore } from '../stores/authStore';
import { client } from '../api/client';
import classes from './Onboarding.module.css';

import { AcademicForm } from './onboarding/AcademicForm.tsx';
import { HealthForm } from './onboarding/HealthForm.tsx';
import { BehaviouralForm } from './onboarding/BehaviouralForm.tsx';
import { FixedBlockEditor } from './onboarding/FixedBlockEditor.tsx';
import { GoalSetupForm } from './onboarding/GoalSetupForm.tsx';
import { Loader2 } from 'lucide-react';

const STEPS = [
  { id: 'academic', label: 'Academic' },
  { id: 'health', label: 'Health' },
  { id: 'behavioural', label: 'Rhythm' },
  { id: 'fixed', label: 'Blocks' },
  { id: 'goal', label: 'First Goal' }
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { onboardingComplete, setOnboardingComplete } = useAuthStore();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);

  // Resume status — also handles redirect if already complete
  useEffect(() => {
    if (onboardingComplete) {
      navigate('/home', { replace: true });
      return;
    }

    const checkStatus = async () => {
      try {
        const response = await client.get('/onboarding/status');
        const data = response.data;

        // If backend already says complete, sync store and redirect
        if (data.onboarding_complete) {
          setOnboardingComplete(true);
          navigate('/home', { replace: true });
          return;
        }

        // next_step is one of: "academic_profile", "behavioural_profile",
        // "fixed_blocks", "first_goal", or null when done
        const stepId: string | null = data.next_step;
        if (!stepId) return;

        // Map backend step name → wizard index
        const stepMap: Record<string, number> = {
          academic_profile: 0,
          health_profile: 1,
          behavioural_profile: 2,
          fixed_blocks: 3,
          first_goal: 4,
        };
        const idx = stepMap[stepId];
        if (idx !== undefined) setCurrentStep(idx);
      } catch {
        setCurrentStep(0);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [onboardingComplete, navigate, setOnboardingComplete]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(curr => curr + 1);
    } else {
      // Final step: GoalSetupForm already awaited the POST successfully.
      // Set the flag synchronously — Zustand flushes before the next render,
      // so AuthGate will read onboardingComplete=true when it evaluates.
      setOnboardingComplete(true);
      navigate('/home', { replace: true });
    }
  };

  if (loading) {
    return (
      <div className={classes.loadingContainer}>
        <Loader2 className={classes.spin} size={32} />
        <p>Loading your profile...</p>
      </div>
    );
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return <AcademicForm onComplete={handleNext} />;
      case 1: return <HealthForm onComplete={handleNext} />;
      case 2: return <BehaviouralForm onComplete={handleNext} />;
      case 3: return <FixedBlockEditor onComplete={handleNext} />;
      case 4: return <GoalSetupForm onComplete={handleNext} />;
      default: return null;
    }
  };

  return (
    <div className={classes.pageContainer}>
      <div className={classes.wizardCard}>
        <div className={classes.wizardHeader}>
          <h2>Let's build your Momentum</h2>
          <p>We need a few details to tailor the AI engine to your rhythm.</p>
        </div>

        <StepProgress steps={STEPS} currentStepIndex={currentStep} />
        
        <div className={classes.formContainer}>
          {renderCurrentStep()}
        </div>
      </div>
    </div>
  );
}
