/**
 * Android keycodes for the printable half of a physical keyboard, and the DOM
 * `KeyboardEvent.code` → keycode mapping used by the renderer to forward typing.
 *
 * Android Auto's input channel is documented for command keys (D-pad, media,
 * dial pad, navigation), but the phone side accepts the standard
 * `android.view.KeyEvent` keycodes, and those include the letters and the
 * punctuation around them. LIVI never advertised or sent them, so a keyboard
 * could only drive the head unit's command bindings — this is the table that
 * lets a key reach the phone as the key it is.
 */

/** Android `KeyEvent.KEYCODE_*` values for printable keys. */
export const PRINTABLE_KEYCODE = {
  // Letters (A–Z): 29–54, in alphabetical order.
  A: 29,
  B: 30,
  C: 31,
  D: 32,
  E: 33,
  F: 34,
  G: 35,
  H: 36,
  I: 37,
  J: 38,
  K: 39,
  L: 40,
  M: 41,
  N: 42,
  O: 43,
  P: 44,
  Q: 45,
  R: 46,
  S: 47,
  T: 48,
  U: 49,
  V: 50,
  W: 51,
  X: 52,
  Y: 53,
  Z: 54,
  // Punctuation and whitespace.
  COMMA: 55,
  PERIOD: 56,
  SHIFT_LEFT: 59,
  TAB: 61,
  SPACE: 62,
  DEL: 67, // backspace
  GRAVE: 68,
  MINUS: 69,
  EQUALS: 70,
  LEFT_BRACKET: 71,
  RIGHT_BRACKET: 72,
  BACKSLASH: 73,
  SEMICOLON: 74,
  APOSTROPHE: 75,
  SLASH: 76,
  AT: 77,
  PLUS: 81
} as const

/**
 * The printable set to advertise in the service discovery response, minus the
 * digits and `*`/`#`: those are already in `BUTTON_KEY` as the dial-pad
 * keycodes (7–18) and already advertised. A keycode the head unit does not
 * advertise is dropped by the phone, so this list has to reach the SDR.
 */
export const TYPING_KEYCODES: number[] = Object.values(PRINTABLE_KEYCODE)

/** DOM `KeyboardEvent.code` → Android keycode, or null when it is not a typing key. */
export function androidKeycodeForDomCode(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) return PRINTABLE_KEYCODE[code.slice(3) as 'A']
  if (/^Digit[0-9]$/.test(code)) {
    // KEYCODE_1..KEYCODE_9 = 8..16, KEYCODE_0 = 7.
    const digit = Number.parseInt(code.slice(5), 10)
    return digit === 0 ? 7 : digit + 7
  }
  switch (code) {
    case 'Space':
      return PRINTABLE_KEYCODE.SPACE
    case 'Comma':
      return PRINTABLE_KEYCODE.COMMA
    case 'Period':
      return PRINTABLE_KEYCODE.PERIOD
    case 'Minus':
      return PRINTABLE_KEYCODE.MINUS
    case 'Equal':
      return PRINTABLE_KEYCODE.EQUALS
    case 'BracketLeft':
      return PRINTABLE_KEYCODE.LEFT_BRACKET
    case 'BracketRight':
      return PRINTABLE_KEYCODE.RIGHT_BRACKET
    case 'Backslash':
      return PRINTABLE_KEYCODE.BACKSLASH
    case 'Semicolon':
      return PRINTABLE_KEYCODE.SEMICOLON
    case 'Quote':
      return PRINTABLE_KEYCODE.APOSTROPHE
    case 'Backquote':
      return PRINTABLE_KEYCODE.GRAVE
    case 'Slash':
      return PRINTABLE_KEYCODE.SLASH
    case 'Backspace':
      return PRINTABLE_KEYCODE.DEL
    case 'Tab':
      return PRINTABLE_KEYCODE.TAB
    case 'NumpadAdd':
      return PRINTABLE_KEYCODE.PLUS
    case 'NumpadComma':
      return PRINTABLE_KEYCODE.COMMA
    case 'NumpadDecimal':
      return PRINTABLE_KEYCODE.PERIOD
    case 'NumpadDivide':
      return PRINTABLE_KEYCODE.SLASH
    case 'NumpadEqual':
      return PRINTABLE_KEYCODE.EQUALS
    case 'NumpadMultiply':
      return 17 // KEYCODE_STAR
    case 'NumpadSubtract':
      return PRINTABLE_KEYCODE.MINUS
    default:
      return null
  }
}
