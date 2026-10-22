import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11.5a7 7 0 0 0 14 0" />
      <path d="M12 18.5V22" />
      <path d="M8.5 22h7" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="14" r="3.5" />
    </Icon>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 5 7 7-7 7" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H6l-3 2 1-5.2A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
      <path d="M19 3v3M17.5 4.5h3" />
      <path d="M5 17v2.5M3.8 18.2h2.5" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 6.5" />
    </Icon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 8h12l1.5 12h-15L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
    </Icon>
  );
}

export function RepeatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.6-1.5 1.2-1.5 2.5" />
      <path d="M12 17.5h.01" />
    </Icon>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4Z" />
      <path d="M15 9a4 4 0 0 1 0 6" />
      <path d="M17.5 6.5a8 8 0 0 1 0 11" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m21 3-9.5 18-2.6-7.9L1 10.5 21 3Z" />
      <path d="M8.9 13.1 21 3" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}
