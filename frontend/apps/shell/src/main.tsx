// Async boundary: lets Module Federation negotiate shared singletons
// (React, router, query client, SDK) before any of them is evaluated.
void import("./bootstrap");
