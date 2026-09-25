export enum ROUTES {
  HOME = '/',
  CLUSTER = '/cluster',
  MEDIA = '/media',
  CAMERA = '/camera',
  DEVICES = '/devices',
  SETTINGS = '/settings',
  TELEMETRY = '/telemetry',
  QUIT = 'quit',
  TRANSPORT_SWITCH = 'transport-switch'
}

export const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="treeitem"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  'input:not([disabled]):not([type="hidden"])',
  'input[type="checkbox"]:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export enum THEME {
  LIGHT = 'light',
  DARK = 'dark'
}

export const EMPTY_STRING = '—'

export const UI = {
  MIN_HEIGHT_SHOW_TIME_WIFI: 220,
  XS_ICON_MAX_HEIGHT: 320,
  INACTIVITY_HIDE_DELAY_MS: 3000,
  // Above the projection overlay (#projection-root, z 999): that surface is the
  // phone's touch area and spans the window, so the rail has to paint and
  // hit-test over it or its buttons are unreachable while a phone streams.
  NAV_Z_INDEX: 1000
} as const
