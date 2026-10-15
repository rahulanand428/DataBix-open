import { mountStandalone } from "@databix/devhost";

import App from "./App";

mountStandalone(App, { home: "/explorer", base: import.meta.env.BASE_URL });
