import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    [attribute: string]: unknown;
  }
  interface SVGAttributes<T> {
    [attribute: string]: unknown;
  }
}
