export interface PwaManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface PwaManifestContract {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  background_color: string;
  theme_color: string;
  icons: PwaManifestIcon[];
}

export interface PwaManifestValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    hasId: boolean;
    isShortNameCompliant: boolean;
    isStandalone: boolean;
    hasMaskableIcon: boolean;
    has192Icon: boolean;
    has512Icon: boolean;
  };
}

export interface DeviceSessionStability {
  deviceId: string;
  deviceType: 'WINDOWS_DESKTOP' | 'ANDROID_PHONE' | 'PIXEL_FOLD' | 'IOS_SAFARI' | 'UNKNOWN';
  isDesignatedExecutor: boolean;
  lastHeartbeatTimestamp: number;
  isSessionActive: boolean;
  isBackgroundSuspensionRisk: boolean;
  failClosedReason?: string;
}

export interface FoldableLayoutMetrics {
  isFoldableDevice: boolean;
  isDualPaneActive: boolean;
  paneMode: 'SINGLE_PANE' | 'DUAL_PANE_EXPANDED';
  viewportWidth: number;
  viewportHeight: number;
  aspectRatio: number;
}
