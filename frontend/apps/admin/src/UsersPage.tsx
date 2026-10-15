import { useAdminMutations, useAuth, useUsers, type Schemas } from "@databix/sdk";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  Field,
  Input,
  MenuItem,
  Page,
  PageHeader,
  Popover,
  Switch,
  formatRelative,
  useToast,
} from "@databix/ui";
import { KeyRound, MoreHorizontal, ShieldCheck, ShieldOff, UserCheck, UserPlus, UserX } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AdminTabs } from "./AdminTabs";

type User = Schemas["AdminUser"];

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createUser } = useAdminMutations();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setUsername("");
    setPassword("");
    setAdmin(false);
    setError(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const user = await createUser.mutateAsync({ username, password, is_admin: admin });
      toast.show(`Created ${user.username}`, "good");
      reset();
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title="Add a user" description="Share the password with them securely; they can't change it themselves yet.">
      <form className="dbx-stack" onSubmit={submit} style={{ ["--dbx-gap" as string]: "14px" }}>
        {error && <Alert tone="critical">{error}</Alert>}
        <Field label="Username" htmlFor="new-username" hint="3–100 characters; stored in lower case.">
          <Input id="new-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required />
        </Field>
        <Field label="Initial password" htmlFor="new-password" hint="At least 8 characters.">
          <Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
        </Field>
        <Switch label="Administrator (can ingest data, manage users and branding)" checked={admin} onChange={(event) => setAdmin(event.target.checked)} />
        <div className="dbx-row dbx-row--end">
          <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button type="submit" variant="primary" icon={UserPlus} loading={createUser.isPending} disabled={username.trim().length < 3 || password.length < 8}>
            Add user
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { resetPassword } = useAdminMutations();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      toast.show(`Password reset for ${user.username}; their sessions were signed out.`, "good");
      setPassword("");
      onClose();
    } catch (caught) {
      toast.show((caught as Error).message, "critical");
    }
  };
  return (
    <Dialog open={user !== null} onClose={() => { setPassword(""); onClose(); }} title={`Reset password for ${user?.username ?? ""}`} description="They will be signed out everywhere.">
      <form className="dbx-stack" onSubmit={submit} style={{ ["--dbx-gap" as string]: "14px" }}>
        <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
          <Input id="reset-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </Field>
        <div className="dbx-row dbx-row--end">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={KeyRound} loading={resetPassword.isPending} disabled={password.length < 8}>
            Reset password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function UsersPage() {
  const users = useUsers();
  const { user: me } = useAuth();
  const { updateUser } = useAdminMutations();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);

  const change = async (user: User, patch: Schemas["AdminUserUpdate"], message: string) => {
    try {
      await updateUser.mutateAsync({ id: user.id, ...patch });
      toast.show(message, "good");
    } catch (error) {
      toast.show((error as Error).message, "critical");
    }
  };

  const items = users.data?.items ?? [];
  const admins = items.filter((user) => user.is_admin && user.is_active).length;

  return (
    <Page>
      <PageHeader
        title="Administration"
        description="People who can sign in. Public signup is off; accounts are created here or with the auth.manage CLI."
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>Add user</Button>}
      />
      <AdminTabs />
      <Card flush title={`${items.length} accounts`} subtitle={`${admins} active administrator${admins === 1 ? "" : "s"}`}>
        <DataTable
          caption="Users"
          loading={users.isLoading}
          rows={items}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "user",
              header: "User",
              cell: (row) => (
                <span className="dbx-row" style={{ ["--dbx-gap" as string]: "10px" }}>
                  <Avatar name={row.username} />
                  <span>
                    <strong>{row.username}</strong>
                    {row.id === me?.id && <span className="dbx-muted"> (you)</span>}
                  </span>
                </span>
              ),
            },
            { key: "role", header: "Role", cell: (row) => (row.is_admin ? <Badge tone="brand" icon={ShieldCheck}>Administrator</Badge> : <Badge>Analyst</Badge>) },
            { key: "status", header: "Status", cell: (row) => (row.is_active ? <Badge tone="good" icon={UserCheck}>Active</Badge> : <Badge icon={UserX}>Deactivated</Badge>) },
            { key: "last", header: "Last sign-in", cell: (row) => formatRelative(row.last_login_at) },
            { key: "created", header: "Created", cell: (row) => (row.created_at ? formatRelative(row.created_at) : <span className="dbx-muted">before tracking</span>) },
            {
              key: "actions",
              header: <span className="dbx-sr-only">Actions</span>,
              width: 56,
              cell: (row) => {
                const self = row.id === me?.id;
                return (
                  <Popover
                    trigger={({ toggle, open }) => (
                      <Button variant="ghost" size="sm" iconOnly icon={MoreHorizontal} onClick={toggle} aria-expanded={open}>
                        Actions for {row.username}
                      </Button>
                    )}
                  >
                    {(close) => (
                      <div style={{ width: 230 }}>
                        {row.is_admin ? (
                          !self && <MenuItem icon={ShieldOff} onSelect={() => { close(); void change(row, { is_admin: false }, `${row.username} is now an analyst`); }}>Remove administrator</MenuItem>
                        ) : (
                          <MenuItem icon={ShieldCheck} onSelect={() => { close(); void change(row, { is_admin: true }, `${row.username} is now an administrator`); }}>Make administrator</MenuItem>
                        )}
                        <MenuItem icon={KeyRound} onSelect={() => { close(); setResetting(row); }}>Reset password</MenuItem>
                        {!self &&
                          (row.is_active ? (
                            <MenuItem icon={UserX} onSelect={() => { close(); void change(row, { is_active: false }, `${row.username} was deactivated and signed out`); }}>Deactivate</MenuItem>
                          ) : (
                            <MenuItem icon={UserCheck} onSelect={() => { close(); void change(row, { is_active: true }, `${row.username} was reactivated`); }}>Reactivate</MenuItem>
                          ))}
                        {self && <p className="dbx-muted" style={{ padding: "6px 10px", fontSize: 12 }}>You can't demote or deactivate yourself.</p>}
                      </div>
                    )}
                  </Popover>
                );
              },
            },
          ]}
        />
      </Card>
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </Page>
  );
}
