export enum InputCommand {
  Play = 'play',
  Pause = 'pause',
  PlayPause = 'playPause',
  Stop = 'stop',
  Next = 'next',
  Previous = 'previous',
  FastForward = 'fastForward',
  Rewind = 'rewind',
  VolumeUp = 'volumeUp',
  VolumeDown = 'volumeDown',
  Mute = 'mute',
  AcceptCall = 'acceptCall',
  RejectCall = 'rejectCall',
  HookSwitch = 'hookSwitch',
  VoiceAssistant = 'voiceAssistant'
}

export type InputCommandKey = `${InputCommand}`

export function isInputCommand(value: unknown): value is InputCommand {
  return typeof value === 'string' && (Object.values(InputCommand) as string[]).includes(value)
}

/**
 * Typing keys carry a keycode, so they cannot live in the `InputCommand` enum.
 * They travel the same IPC path as the commands above, encoded as
 * `key:<Android keycode>` — the renderer forwards a physical keyboard's
 * printable keys that way, and the projection service maps them back to a key
 * event on the active driver.
 */
export const RAW_KEY_PREFIX = 'key:'

export function rawKeyCommand(keyCode: number): string {
  return `${RAW_KEY_PREFIX}${keyCode}`
}

export function parseRawKeyCommand(command: string): number | null {
  if (!command.startsWith(RAW_KEY_PREFIX)) return null
  const keyCode = Number.parseInt(command.slice(RAW_KEY_PREFIX.length), 10)
  return Number.isInteger(keyCode) && keyCode > 0 ? keyCode : null
}
