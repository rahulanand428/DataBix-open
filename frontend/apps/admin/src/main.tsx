// Standalone development entry: `pnpm --filter @databix/admin dev` runs this
// remote by itself with the shell's providers. In production the shell loads
// ./App through Module Federation instead.
void import("./standalone");
