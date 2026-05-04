// Tiny inline icons — keeps deps minimal.
import type { SVGProps } from "react";

const I = (p: SVGProps<SVGSVGElement>) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  />
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M12 5v14M5 12h14" /></I>
);
export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M18 6 6 18M6 6l12 12" /></I>
);
export const SunIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </I>
);
export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" /></I>
);
export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></I>
);
export const StopIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /></I>
);
export const ToolIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M14.7 6.3a4 4 0 1 1 5.66 5.66l-1.06 1.06-5.66-5.66 1.06-1.06ZM3 21l5.5-1.5 9-9-4-4-9 9L3 21Z" />
  </I>
);
export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /></I>
);
export const FileIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </I>
);
export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </I>
);
export const CodeIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </I>
);
export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m9 18 6-6-6-6" /></I>
);
export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="m15 18-6-6 6-6" /></I>
);
export const ScissorsIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </I>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </I>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}><path d="M20 6 9 17l-5-5" /></I>
);
export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </I>
);
export const BroadcastIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
  </I>
);
export const MailIcon = (p: SVGProps<SVGSVGElement>) => (
  <I {...p}>
    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="m22 7-10 6L2 7" />
  </I>
);
