import { NavLink } from 'react-router-dom';
import { Home, Target, Calendar, BarChart2, Settings } from 'lucide-react';
import classes from './Sidebar.module.css';

export const Sidebar = () => {
  return (
    <aside className={classes.sidebar}>
      <div className={classes.logo}>
        <div className={classes.logoMark} />
        <h2>Momentum</h2>
      </div>
      
      <nav className={classes.nav}>
        <NavLink 
          to="/dashboard" 
          className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
        >
          <Home size={20} />
          <span>Dashboard</span>
        </NavLink>
        
        <NavLink 
          to="/goals" 
          className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
        >
          <Target size={20} />
          <span>Goals</span>
        </NavLink>
        
        <NavLink 
          to="/schedule" 
          className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
        >
          <Calendar size={20} />
          <span>Schedule</span>
        </NavLink>

        <NavLink 
          to="/insights" 
          className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
        >
          <BarChart2 size={20} />
          <span>Insights</span>
        </NavLink>
      </nav>

      <div className={classes.footer}>
        <NavLink 
          to="/settings" 
          className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
        >
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
};
