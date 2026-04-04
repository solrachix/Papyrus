import React from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const defaultColor = "#111827";

export const IconDocument: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M10 3v4a1 1 0 0 1-1 1H5m14-4v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconGrid: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.143 4H4.857A.857.857 0 0 0 4 4.857v4.286c0 .473.384.857.857.857h4.286A.857.857 0 0 0 10 9.143V4.857A.857.857 0 0 0 9.143 4Zm10 0h-4.286a.857.857 0 0 0-.857.857v4.286c0 .473.384.857.857.857h4.286A.857.857 0 0 0 20 9.143V4.857A.857.857 0 0 0 19.143 4Zm-10 10H4.857a.857.857 0 0 0-.857.857v4.286c0 .473.384.857.857.857h4.286a.857.857 0 0 0 .857-.857v-4.286A.857.857 0 0 0 9.143 14Zm10 0h-4.286a.857.857 0 0 0-.857.857v4.286c0 .473.384.857.857.857h4.286a.857.857 0 0 0 .857-.857v-4.286a.857.857 0 0 0-.857-.857Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconPageNav: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <Path
      d="M9 4v16M6.5 8h.01M6.5 12h.01M6.5 16h.01"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconSearch: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </Svg>
);

export const IconZoomIn: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12h14m-7 7V5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconZoomOut: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12h14"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconSettings: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 13v-2a1 1 0 0 0-1-1h-.757l-.707-1.707.535-.536a1 1 0 0 0 0-1.414l-1.414-1.414a1 1 0 0 0-1.414 0l-.536.535L14 4.757V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v.757l-1.707.707-.536-.535a1 1 0 0 0-1.414 0L4.929 6.343a1 1 0 0 0 0 1.414l.536.536L4.757 10H4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h.757l.707 1.707-.535.536a1 1 0 0 0 0 1.414l1.414 1.414a1 1 0 0 0 1.414 0l.536-.535 1.707.707V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.757l1.707-.708.536.536a1 1 0 0 0 1.414 0l1.414-1.414a1 1 0 0 0 0-1.414l-.535-.536.707-1.707H20a1 1 0 0 0 1-1Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconComment: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M8 9h8"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M8 13h6"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconInfo: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 16v-5m0-3.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconCursor: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9 20H5.5c-.27614 0-.5-.2239-.5-.5v-3c0-.2761.22386-.5.5-.5h13c.2761 0 .5.2239.5.5v3c0 .2761-.2239.5-.5.5H18m-6-1 1.42 1.8933c.04.0534.12.0534.16 0L15 19m-7-6 3.9072-9.76789c.0335-.08381.1521-.08381.1856 0L16 13m-8 0H7m1 0h1.5m6.5 0h-1.5m1.5 0h1m-7-3.00001h4"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </Svg>
);

export const IconPalette: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 7h.01m3.486 1.513h.01m-6.978 0h.01M6.99 12H7m9 4h2.706a1.957 1.957 0 0 0 1.883-1.325A9 9 0 1 0 3.043 12.89 9.1 9.1 0 0 0 8.2 20.1a8.62 8.62 0 0 0 3.769.9 2.013 2.013 0 0 0 2.03-2v-.857A2.036 2.036 0 0 1 16 16Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconColorRing: React.FC<{
  size?: number;
  centerColor?: string;
  borderColor?: string;
}> = ({ size = 28, centerColor = "#000000", borderColor = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <Defs>
      <LinearGradient
        id="colorRingGradient"
        x1="4"
        y1="4"
        x2="32"
        y2="32"
        gradientUnits="userSpaceOnUse"
      >
        <Stop offset="0" stopColor="#3b82f6" />
        <Stop offset="0.18" stopColor="#22c55e" />
        <Stop offset="0.38" stopColor="#fde047" />
        <Stop offset="0.58" stopColor="#f97316" />
        <Stop offset="0.78" stopColor="#ec4899" />
        <Stop offset="1" stopColor="#8b5cf6" />
      </LinearGradient>
    </Defs>
    <Circle cx="18" cy="18" r="16" fill="url(#colorRingGradient)" />
    <Circle cx="18" cy="18" r="11.8" fill={centerColor} stroke={borderColor} strokeWidth="1.8" />
  </Svg>
);

export const IconTrash: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconLink: React.FC<IconProps> = ({
  size = 20,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13.213 9.787a3.391 3.391 0 0 0-4.795 0l-3.425 3.426a3.39 3.39 0 0 0 4.795 4.794l.321-.304m-.321-4.49a3.39 3.39 0 0 0 4.795 0l3.424-3.426a3.39 3.39 0 0 0-4.794-4.795l-1.028.961"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconEdit: React.FC<{ size?: number; color?: string }> = ({
  size = 18,
  color = defaultColor,
}) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path
      d="M5 1a2 2 0 0 0-2 2v9.998a2 2 0 0 0 2 2h1.046l.25-1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3v2.5A1.5 1.5 0 0 0 9.498 6h2.5v1.44a2.535 2.535 0 0 1 1-.405V5.413a1.5 1.5 0 0 0-.44-1.06L9.645 1.439A1.5 1.5 0 0 0 8.585 1H5Zm6.791 4H9.5a.5.5 0 0 1-.5-.5V2.206l2.792 2.792Zm1.207 3.06a1.56 1.56 0 0 0-.662.394L8.05 12.74a2.777 2.777 0 0 0-.722 1.257l-.009.033l-.302 1.211a.61.61 0 0 0 .738.74l1.211-.303a2.776 2.776 0 0 0 1.29-.73l4.288-4.288a1.56 1.56 0 0 0-1.545-2.6Z"
      fill={color}
    />
  </Svg>
);

export const IconToolDockTrigger: React.FC<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ size = 20, color = defaultColor, strokeWidth = 2.1 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth={strokeWidth} />
    <Path
      d="M11.05 7.2h1.9l2.1 7.05H8.95l2.1-7.05Z"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <Rect
      x="10.15"
      y="13.35"
      width="3.7"
      height="3.15"
      rx="0.4"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
    />
  </Svg>
);

export const IconChevronRight: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="m9 5 7 7-7 7"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconChevronLeft: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="m15 19-7-7 7-7"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconClose: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 6l12 12M18 6 6 18"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconUndo: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.25 6.25 5.5 10l3.75 3.75"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M6 10h7.25c3.18 0 5.75 2.57 5.75 5.75S16.43 21.5 13.25 21.5h-4"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconRedo: React.FC<IconProps> = ({
  size = 18,
  color = defaultColor,
  strokeWidth = 2,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14.75 6.25 18.5 10l-3.75 3.75"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M18 10h-7.25C7.57 10 5 12.57 5 15.75s2.57 5.75 5.75 5.75h4"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconHand: React.FC<{ size?: number; color?: string }> = ({
  size = 20,
  color = "#111827",
}) => (
  <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
    <Path
      d="M25.129 53.512c8.25 0 14.039-4.477 17.156-13.266l4.125-11.602c1.031-2.93.094-5.343-2.344-6.234c-2.18-.797-4.336.14-5.367 2.555l-1.523 3.75c-.047.094-.117.164-.211.164c-.117 0-.164-.094-.164-.211V9.871c0-2.742-1.711-4.453-4.336-4.453c-.961 0-1.828.328-2.485.938c-.304-2.391-1.851-3.868-4.171-3.868c-2.274 0-3.868 1.524-4.22 3.82c-.585-.585-1.429-.89-2.273-.89c-2.437 0-4.054 1.688-4.054 4.29v2.6c-.633-.656-1.57-1.007-2.578-1.007c-2.438 0-4.125 1.804-4.125 4.43v20.132c0 10.969 6.656 17.649 16.57 17.649m-.117-3.258c-8.297 0-13.36-5.32-13.36-14.766v-19.43c0-.984.633-1.687 1.618-1.687c.96 0 1.664.703 1.664 1.688v11.976c0 .867.703 1.453 1.453 1.453c.797 0 1.523-.586 1.523-1.453V10.13c0-1.008.633-1.688 1.594-1.688c.984 0 1.664.68 1.664 1.688v16.71c0 .868.703 1.454 1.477 1.454c.796 0 1.523-.586 1.523-1.453V7.223c0-.985.656-1.711 1.64-1.711c.938 0 1.618.726 1.618 1.71V26.84c0 .82.656 1.453 1.476 1.453c.797 0 1.5-.633 1.5-1.453V10.129c0-1.008.68-1.688 1.641-1.688c.984 0 1.64.68 1.64 1.688V33.19c0 1.078.68 1.852 1.665 1.852c.843 0 1.547-.375 2.086-1.547l3.187-7.125c.422-1.008 1.266-1.523 2.133-1.195c.937.375 1.266 1.265.82 2.484l-4.148 11.578c-2.86 7.993-7.875 11.016-14.414 11.016"
      fill={color}
    />
  </Svg>
);

export const IconToolSelect: React.FC<IconProps> = ({
  size = 28,
  color = defaultColor,
}) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Path
      d="M9 5.5v13.8c0 .42.47.66.82.42l3.38-2.32a.72.72 0 0 1 .95.12l3.06 3.93a1.2 1.2 0 0 0 1.68.22l1.1-.85a1.2 1.2 0 0 0 .22-1.68l-3.04-3.9a.72.72 0 0 1 .2-1.07l3.58-1.83c.4-.2.34-.8-.09-.92L9.8 5.02A.64.64 0 0 0 9 5.5Z"
      fill={color}
    />
  </Svg>
);

export const IconToolInk: React.FC<IconProps> = ({
  size = 32,
  color = defaultColor,
}) => (
  <Svg width={size} height={size} viewBox="0 0 38 107" fill="none">
    <Defs>
      <LinearGradient id="penBody" x1="8" y1="81.7" x2="30" y2="81.7">
        <Stop offset="0" stopColor="#2e2e2e" />
        <Stop offset="0.1" stopColor="#393939" />
        <Stop offset="0.5" stopColor="#212121" />
        <Stop offset="0.82" stopColor="#373737" />
        <Stop offset="1" stopColor="#363636" />
      </LinearGradient>
      <LinearGradient id="penBand" x1="8" y1="53.1" x2="30" y2="53.1">
        <Stop offset="0" stopColor="#b9b9b9" />
        <Stop offset="0.5" stopColor="#fbfbfb" />
        <Stop offset="1" stopColor="#a8a8a8" />
      </LinearGradient>
      <LinearGradient id="penCap" x1="15" y1="9.6" x2="23" y2="9.6">
        <Stop offset="0" stopColor="#b9b9b9" />
        <Stop offset="0.5" stopColor="#fbfbfb" />
        <Stop offset="1" stopColor="#a8a8a8" />
      </LinearGradient>
    </Defs>
    <Rect x="11" y="54" width="16" height="53" rx="1.5" fill="url(#penBody)" />
    <Path
      d="M11 47.35V52H27V47.35c0-1.94-.2-3.88-.6-5.76L20.3 4h-2.6l-6.1 37.6c-.4 1.88-.6 3.82-.6 5.75Z"
      fill="url(#penBody)"
    />
    <Rect x="11" y="52" width="16" height="2" fill="url(#penBand)" />
    <Rect x="15" y="4" width="8" height="10" rx="0.8" fill="url(#penCap)" />
    <Path d="M18.55 4.6h.9L26.2 40H11.8l6.75-35.4Z" fill="rgba(255,255,255,0.05)" />
    <Rect x="11" y="52" width="16" height="2" fill={color} opacity="0.35" />
  </Svg>
);

export const IconToolHighlighter: React.FC<IconProps> = ({
  size = 32,
  color = "#f4c430",
}) => (
  <Svg width={size} height={size} viewBox="0 0 38 87" fill="none">
    <Defs>
      <LinearGradient id="markerMetal" x1="13" y1="10.6" x2="25" y2="10.6">
        <Stop offset="0" stopColor="#b9b9b9" />
        <Stop offset="0.5" stopColor="#fbfbfb" />
        <Stop offset="1" stopColor="#a8a8a8" />
      </LinearGradient>
      <LinearGradient id="markerBody" x1="8" y1="34.6" x2="30" y2="34.6">
        <Stop offset="0" stopColor="#2e2e2e" />
        <Stop offset="0.08" stopColor="#393939" />
        <Stop offset="0.36" stopColor="#212121" />
        <Stop offset="0.82" stopColor="#373737" />
        <Stop offset="1" stopColor="#363636" />
      </LinearGradient>
    </Defs>
    <Path
      d="M13 10.8v5.55h12V5c0-.75-.8-1.23-1.46-.89l-9.46 4.92c-.66.34-1.08 1.03-1.08 1.77Z"
      fill="url(#markerMetal)"
    />
    <Path
      d="M7 40v11.35h24V40c0-1.7-.45-3.37-1.3-4.84l-.48-.82C27.74 31.77 27 28.86 27 25.89V16.35H11V25.9c0 2.96-.74 5.88-2.22 8.44l-.48.82A9.72 9.72 0 0 0 7 40Z"
      fill="url(#markerBody)"
    />
    <Rect x="7" y="51.35" width="24" height="35" rx="1.6" fill="url(#markerBody)" />
    <Rect x="7" y="51.35" width="24" height="11" rx="0.8" fill="url(#markerMetal)" />
    <Rect x="7" y="51.35" width="24" height="11" rx="0.8" fill={color} opacity="0.28" />
  </Svg>
);

export const IconToolUnderline: React.FC<IconProps> = ({
  size = 32,
  color = defaultColor,
}) => (
  <Svg width={size} height={size} viewBox="0 0 38 86" fill="none">
    <Defs>
      <LinearGradient id="pencilBodyTop" x1="8" y1="31" x2="30" y2="31">
        <Stop offset="0" stopColor="#2e2e2e" />
        <Stop offset="0.1" stopColor="#393939" />
        <Stop offset="0.46" stopColor="#212121" />
        <Stop offset="0.82" stopColor="#414141" />
        <Stop offset="1" stopColor="#363636" />
      </LinearGradient>
      <LinearGradient id="pencilBodyBottom" x1="8" y1="65.35" x2="30" y2="65.35">
        <Stop offset="0" stopColor="#2e2e2e" />
        <Stop offset="0.1" stopColor="#393939" />
        <Stop offset="0.46" stopColor="#212121" />
        <Stop offset="0.82" stopColor="#373737" />
        <Stop offset="1" stopColor="#363636" />
      </LinearGradient>
      <LinearGradient id="pencilMetal" x1="8" y1="52" x2="30" y2="52">
        <Stop offset="0" stopColor="#b9b9b9" />
        <Stop offset="0.5" stopColor="#fbfbfb" />
        <Stop offset="1" stopColor="#a8a8a8" />
      </LinearGradient>
      <LinearGradient id="pencilTip" x1="15" y1="9.8" x2="23" y2="9.8">
        <Stop offset="0" stopColor="#b9b9b9" />
        <Stop offset="0.5" stopColor="#fbfbfb" />
        <Stop offset="1" stopColor="#a8a8a8" />
      </LinearGradient>
    </Defs>
    <Path d="M8 43.88v-1L15 16.88h8l7 26v1H8Z" fill="url(#pencilBodyTop)" />
    <Path d="M8 42.88h22v43H8v-43Z" fill="url(#pencilBodyBottom)" />
    <Rect x="8" y="50.88" width="22" height="2" fill="url(#pencilMetal)" />
    <Path
      d="M15 16.88 18.03 4.76c.25-1.01 1.69-1.01 1.94 0L23 16.88h-8Z"
      fill="url(#pencilTip)"
    />
    <Rect x="8" y="50.88" width="22" height="2" fill={color} opacity="0.3" />
  </Svg>
);

export const IconToolSquiggly: React.FC<IconProps> = ({
  size = 32,
  color = defaultColor,
}) => (
  <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <Ellipse cx="18" cy="27.1" rx="7.2" ry="1.8" fill="#d1d5db" opacity="0.32" />
    <Path
      d="M14.35 7.4a1.62 1.62 0 0 1 2.13-.86l5.12 2.3c.6.27.87.97.6 1.56l-.86 1.9-7.84-3.52.85-1.9Z"
      fill={color}
    />
    <Path
      d="m13.48 8.78 7.83 3.52-2.62 5.84a1.22 1.22 0 0 1-1.62.61l-3.98-1.79a1.22 1.22 0 0 1-.61-1.61l2-4.48Z"
      fill="#ffffff"
    />
    <Path
      d="M11.4 24.8c1.15-1.55 2.3-1.55 3.45 0s2.3 1.55 3.45 0 2.3-1.55 3.45 0 2.3 1.55 3.45 0"
      stroke={color}
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconToolStrikeout: React.FC<IconProps> = ({
  size = 32,
  color = defaultColor,
}) => (
  <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <Ellipse cx="18" cy="27.2" rx="7.2" ry="1.8" fill="#d1d5db" opacity="0.32" />
    <Path
      d="M15.48 6.02a1.62 1.62 0 0 1 2.3 0l4.5 4.49a1.18 1.18 0 0 1 0 1.67l-1.4 1.4-6.17-6.16 1.4-1.4c.47-.47 1.22-.47 1.67 0Z"
      fill={color}
    />
    <Path
      d="m14.71 7.42 6.17 6.16-4.6 4.6a1.22 1.22 0 0 1-1.73 0l-3.14-3.14a1.22 1.22 0 0 1 0-1.73l3.3-5.89Z"
      fill="#ffffff"
    />
    <Rect x="10.9" y="17.1" width="14.2" height="2.4" rx="1.2" fill={color} />
  </Svg>
);

export const IconToolNote: React.FC<IconProps> = ({
  size = 32,
  color = "#f4c430",
}) => (
  <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <Ellipse cx="18" cy="27.8" rx="7.2" ry="1.8" fill="#d1d5db" opacity="0.3" />
    <Path
      d="M11.8 8.2A2.2 2.2 0 0 1 14 6h8a2.2 2.2 0 0 1 2.2 2.2v10.4a2.2 2.2 0 0 1-2.2 2.2h-4.7l-3.7 3.2v-3.2H14a2.2 2.2 0 0 1-2.2-2.2V8.2Z"
      fill="#fff7cc"
    />
    <Line x1="15" y1="11.4" x2="21.6" y2="11.4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="15" y1="14.8" x2="21.6" y2="14.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <Line x1="15" y1="18.2" x2="19.2" y2="18.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);
