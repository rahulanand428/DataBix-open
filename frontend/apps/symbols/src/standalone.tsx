import { mountStandalone } from "@databix/devhost";

import App from "./App";

mountStandalone(App, { home: "/symbols", base: import.meta.env.BASE_URL });
