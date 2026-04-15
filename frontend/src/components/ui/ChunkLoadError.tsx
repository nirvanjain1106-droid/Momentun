import classes from './ChunkLoadError.module.css';

interface ChunkLoadErrorProps {
  onRetry: () => void;
}

export const ChunkLoadError = ({ onRetry }: ChunkLoadErrorProps) => {
  return (
    <div className={classes.container}>
      <h2 className={classes.title}>Connection Lost</h2>
      <p className={classes.message}>
        We couldn't load this page. Please check your internet connection and try again.
      </p>
      <button className={classes.retryButton} onClick={onRetry}>
        Reload Page
      </button>
    </div>
  );
};
