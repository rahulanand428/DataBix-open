import { Activity, Database, Palette, Users } from "lucide-react";
import { NavLink } from "react-router";

const TABS = [
  { to: "/admin/status", label: "System status", icon: Activity },
  { to: "/admin/ingestion", label: "Ingestion", icon: Database },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/branding", label: "Branding", icon: Palette },
];

export function AdminTabs() {
  return (
    <nav className="dbx-tabs" aria-label="Administration">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to}>
          <Icon aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

