import {
  RANGE_PRESETS,
  useAlerts,
  useAuth,
  useBranding,
  useCoverage,
  useDateRange,
  useTheme,
  type NavItem,
  type ShellManifest,
} from "@databix/sdk";
import {
  Avatar,
  Badge,
  Button,
  DateRangePicker,
  MenuItem,
  Popover,
  formatDate,
  formatInteger,
} from "@databix/ui";
import {
  Activity,
  Bell,
  ChartLine,
  Database,
  GitCompareArrows,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { matchRemote } from "../remotes/RemoteOutlet";
import { BrandLockup } from "./BrandMark";
import { CommandPalette } from "./CommandPalette";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  table: Table2,
  "chart-line": ChartLine,
  "git-compare": GitCompareArrows,
  star: Star,
  sparkles: Sparkles,
  activity: Activity,
  database: Database,
  users: Users,
  palette: Palette,
};

function Sidebar({ manifest, onNavigate }: { manifest: ShellManifest; onNavigate: () => void }) {
  const { branding } = useBranding();
  const { user } = useAuth();
  const range = useDateRange();
  const alerts = useAlerts();
  const alertCount = alerts.data?.items.length ?? 0;

  const href = (item: NavItem) => {
    const remote = matchRemote(manifest.remotes, item.path);
    const scoped = remote?.rangeScoped?.some((prefix) => item.path.startsWith(prefix.replace(/\/$/, "")));
    return scoped && range.search ? `${item.path}?${range.search}` : item.path;
  };

  return (
    <aside className="dbx-sidebar" aria-label="Main navigation">
      <Link to="/overview" className="dbx-sidebar__brand" onClick={onNavigate}>
        <BrandLockup />
      </Link>
      {manifest.navigation.map((section) => {
        const items = section.items.filter((item) => !item.adminOnly || user?.is_admin);
        if (items.length === 0) return null;
        return (
          <nav key={section.title} aria-label={section.title}>
            <div className="dbx-sidebar__section">{section.title}</div>
            <div className="dbx-sidebar__nav">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                return (
                  <NavLink key={item.path} to={href(item)} className="dbx-nav-link" onClick={onNavigate}>
                    <Icon aria-hidden />
                    {item.title}
                    {item.badge === "alerts" && alertCount > 0 && (
                      <span className="dbx-nav-link__badge" aria-label={`${alertCount} alerts`}>
                        {alertCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        );
      })}
      <div className="dbx-sidebar__footer">
        {branding.footer_text && <span>{branding.footer_text}</span>}
        {branding.support_email && (
          <span>
            Support: <a href={`mailto:${branding.support_email}`}>{branding.support_email}</a>
          </span>
        )}
        {branding.show_powered_by && branding.product_name !== "DataBix" && <span>Powered by DataBix</span>}
      </div>
    </aside>
  );
}

function AlertsBell() {
  const alerts = useAlerts();
  const navigate = useNavigate();
  const items = alerts.data?.items ?? [];
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <Button variant="ghost" iconOnly icon={Bell} onClick={toggle} aria-expanded={open} style={{ position: "relative" }}>
          {items.length ? `${items.length} watchlist alerts` : "No watchlist alerts"}
        </Button>
      )}
    >
      {(close) => (
        <div style={{ width: 320 }}>
          <div className="dbx-menu-label">Watchlist spikes · last {alerts.data?.days ?? 14} days</div>
          {items.length === 0 && <p className="dbx-muted" style={{ padding: "6px 10px 10px" }}>No unusual shorting on your watchlist.</p>}
          {items.slice(0, 6).map((alert) => (
            <MenuItem
              key={`${alert.symbol}-${alert.date}`}
              icon={Activity}
              onSelect={() => {
                close();
                navigate(`/symbols/${encodeURIComponent(alert.symbol)}`);
              }}
            >
              <strong>{alert.symbol}</strong> {alert.ratio.toFixed(1)}× usual · {formatDate(alert.date)}
            </MenuItem>
          ))}
          <div className="dbx-menu-sep" />
          <MenuItem icon={Star} onSelect={() => { close(); navigate("/watchlist"); }}>
            Open watchlist
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" className="dbx-button dbx-button--ghost" onClick={toggle} aria-expanded={open} aria-label="Account menu" style={{ paddingLeft: 4 }}>
          <Avatar name={user.username} />
          <span style={{ fontWeight: 560 }}>{user.username}</span>
        </button>
      )}
    >
      {(close) => (
        <div style={{ width: 240 }}>
          <div style={{ padding: "8px 10px 10px", display: "flex", gap: 8, alignItems: "center" }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.username}</strong>
            {user.is_admin ? <Badge tone="brand" icon={ShieldCheck}>Admin</Badge> : <Badge>Analyst</Badge>}
          </div>
          <div className="dbx-menu-sep" />
          <div className="dbx-menu-label">Theme</div>
          {([
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "Match system", Monitor],
          ] as const).map(([value, label, Icon]) => (
            <MenuItem key={value} icon={Icon} selected={preference === value} onSelect={() => setPreference(value)}>
              {label}
            </MenuItem>
          ))}
          <div className="dbx-menu-sep" />
          <MenuItem
            icon={LogOut}
            onSelect={async () => {
              close();
              await logout();
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

function RangeControl() {
  const range = useDateRange();
  return (
    <DateRangePicker
      value={{ preset: range.preset, from: range.from, to: range.to }}
      presets={RANGE_PRESETS.map(({ id, label }) => ({ id, label }))}
      onPreset={range.setPreset}
      onCustom={range.setCustom}
      min={range.earliest}
      max={range.latest}
    />
  );
}

export function AppLayout({ manifest }: { manifest: ShellManifest }) {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  const coverage = useCoverage();
  const remote = matchRemote(manifest.remotes, pathname);
  const rangeScoped = remote?.rangeScoped?.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.closest("input, textarea, select, [contenteditable]");
      if ((event.key === "/" && !typing) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="dbx-app" data-nav-open={navOpen}>
      <div className="dbx-sidebar-col">
        <Sidebar manifest={manifest} onNavigate={() => setNavOpen(false)} />
      </div>
      {navOpen && <button type="button" className="dbx-nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <div className="dbx-main">
        <header className="dbx-topbar">
          <Button className="dbx-topbar__menu" variant="ghost" iconOnly icon={Menu} onClick={() => setNavOpen(true)}>
            Open navigation
          </Button>
          <div className="dbx-topbar__search">
            <Button icon={Search} onClick={() => setPaletteOpen(true)} aria-keyshortcuts="/ Control+K">
              Search symbols
              <kbd className="dbx-kbd">/</kbd>
            </Button>
          </div>
          {rangeScoped && <RangeControl />}
          <div className="dbx-spacer" />
          {coverage.data?.latest_date && (
            <span className="dbx-topbar__freshness">
              <Badge tone="good" title={`${formatInteger(coverage.data.records)} records, ${formatInteger(coverage.data.symbols)} symbols`}>
                <span className="dbx-dot" style={{ background: "var(--dbx-good)" }} />
                Data through {formatDate(coverage.data.latest_date)}
              </Badge>
            </span>
          )}
          <AlertsBell />
          <UserMenu />
        </header>
        <main className="dbx-content" id="main">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
