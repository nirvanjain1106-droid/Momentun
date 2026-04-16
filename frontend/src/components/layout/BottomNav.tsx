import { NavLink } from 'react-router-dom';
import { Home, Target, Calendar, BarChart2 } from 'lucide-react';
import classes from './BottomNav.module.css';

export const BottomNav = () => {
  return (
    <nav className={classes.bottomNav}>
      <NavLink 
        to="/dashboard" 
        aria-label="Home"
        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
      >
        <Home size={24} />
      </NavLink>
      
      <NavLink 
        to="/goals" 
        aria-label="Goals"
        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
      >
        <Target size={24} />
      </NavLink>
      
      <NavLink 
        to="/schedule" 
        aria-label="Schedule"
        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
      >
        <Calendar size={24} />
      </NavLink>

      <NavLink 
        to="/insights" 
        aria-label="Insights"
        className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
      >
        <BarChart2 size={24} />
      </NavLink>
    </nav>
  );
};
