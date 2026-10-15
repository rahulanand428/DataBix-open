import { mountStandalone } from "@databix/devhost";

import App from "./App";

mountStandalone(App, { home: "/admin/status", base: import.meta.env.BASE_URL });
