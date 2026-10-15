import { mountStandalone } from "@databix/devhost";

import App from "./App";

mountStandalone(App, { home: "/overview", base: import.meta.env.BASE_URL });
