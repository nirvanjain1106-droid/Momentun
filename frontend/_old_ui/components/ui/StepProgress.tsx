import { Check } from 'lucide-react';
import classes from './StepProgress.module.css';

export interface Step {
  id: string;
  label: string;
}

interface StepProgressProps {
  steps: Step[];
  currentStepIndex: number;
}

export const StepProgress = ({ steps, currentStepIndex }: StepProgressProps) => {
  return (
    <div className={classes.container}>
      <div className={classes.track} />
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isActive = index === currentStepIndex;

        return (
          <div 
            key={step.id} 
            className={`${classes.step} ${isActive ? classes.active : ''} ${isCompleted ? classes.completed : ''}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <div className={classes.stepCircle}>
              {isCompleted ? <Check size={14} strokeWidth={3} /> : (index + 1)}
            </div>
            <span className={classes.stepLabel}>{step.label}</span>
            {/* The progress line connecting steps dynamically */}
            {index < steps.length - 1 && (
              <div 
                className={`${classes.connector} ${isCompleted ? classes.connectorCompleted : ''}`} 
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
