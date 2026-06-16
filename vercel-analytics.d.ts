declare module '@vercel/analytics/next' {
  import type { ComponentType } from 'react';

  export type BeforeSendEvent = {
    url: string;
    [key: string]: unknown;
  };

  export const Analytics: ComponentType<{
    mode?: 'auto' | 'production' | 'development';
    debug?: boolean;
    beforeSend?: (event: BeforeSendEvent) => BeforeSendEvent | null;
  }>;
}
