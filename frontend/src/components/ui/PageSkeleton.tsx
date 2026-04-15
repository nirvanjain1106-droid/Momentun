import classes from './PageSkeleton.module.css';

export const PageSkeleton = () => {
  return (
    <div className={classes.skeletonContainer}>
      <div className={`${classes.skeletonPulse} ${classes.header}`} />
      <div className={`${classes.skeletonPulse} ${classes.card}`} />
      <div className={`${classes.skeletonPulse} ${classes.card}`} style={{ width: '80%' }} />
      <div className={`${classes.skeletonPulse} ${classes.card}`} style={{ width: '90%' }} />
    </div>
  );
};
