import { BarChart2, Calendar, Home, Target, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import classes from './BottomNav.module.css';

const items = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/tasks', label: 'Tasks', icon: Calendar },
  { to: '/insights', label: 'Insights', icon: BarChart2 },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/profile', label: 'Profile', icon: User },
];

export const BottomNav = () => {
  return (
    <nav className={classes.bottomNav} aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
        >
          <item.icon size={18} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};
