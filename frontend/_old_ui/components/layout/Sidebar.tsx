import { BarChart2, Calendar, Home, Target, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import classes from './Sidebar.module.css';

const items = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/tasks', label: 'Tasks', icon: Calendar },
  { to: '/insights', label: 'Insights', icon: BarChart2 },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/profile', label: 'Profile', icon: User },
];

export const Sidebar = () => {
  return (
    <aside className={classes.sidebar}>
      <div className={classes.logo}>
        <div className={classes.logoMark} />
        <div>
          <h2>Momentum</h2>
          <p>Adaptive scheduling</p>
        </div>
      </div>

      <nav className={classes.nav}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `${classes.navItem} ${isActive ? classes.active : ''}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
