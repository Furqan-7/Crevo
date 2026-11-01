import "react";

declare module "react" {
  interface CSSProperties {
    // The design's inline styles use CSS custom properties (--cv-*, --token-*)
    // and CSS features newer than React's type definitions. They work at
    // runtime; this just stops TypeScript rejecting them.
    [key: string]: string | number | undefined;
  }
}
