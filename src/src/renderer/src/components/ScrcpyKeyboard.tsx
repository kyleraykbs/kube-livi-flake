import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardReturnOutlinedIcon from '@mui/icons-material/KeyboardReturnOutlined'
import { Box, Button, IconButton, Paper } from '@mui/material'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

// Android key codes for the non-printable keys (adb `input keyevent`).
const BACKSPACE_KEYCODE = 67
const ENTER_KEYCODE = 66

const KEY_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
]

const KEY_SX = {
  minWidth: '48px',
  height: '52px',
  px: 1.5,
  fontSize: '1.25rem',
  fontWeight: 500,
  color: 'common.white',
  bgcolor: 'rgba(255, 255, 255, 0.1)',
  borderRadius: '10px',
  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.22)' }
}

const ROW_SX = { display: 'flex', gap: '6px', justifyContent: 'center' }

export type ScrcpyKeyboardProps = {
  open: boolean
  onClose: () => void
}

export function ScrcpyKeyboard({ open, onClose }: ScrcpyKeyboardProps) {
  const { t } = useTranslation()

  // The mirror is laid out around this panel's strip: let the inset reporter measure
  // it as soon as it appears and again when it goes away.
  useEffect(() => {
    if (!open) return
    window.dispatchEvent(new Event('resize'))
    return () => {
      window.dispatchEvent(new Event('resize'))
    }
  }, [open])

  if (!open) return null

  const typeChar = (text: string) => {
    const scrcpy = window.scrcpy
    if (!scrcpy) return
    void scrcpy.type(text).catch(() => {})
  }

  const sendKey = (keycode: number) => {
    const scrcpy = window.scrcpy
    if (!scrcpy) return
    void scrcpy.key(keycode).catch(() => {})
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 4100,
        display: 'flex',
        justifyContent: 'center',
        // only the panel itself should swallow touches, never the whole width
        pointerEvents: 'none'
      }}
    >
      <Paper
        id="scrcpy-keyboard"
        elevation={12}
        role="group"
        aria-label={t('scrcpy.keyboard')}
        sx={{
          pointerEvents: 'auto',
          width: 'min(100%, 900px)',
          m: '8px',
          p: '8px',
          borderRadius: '16px',
          bgcolor: 'rgba(18, 18, 20, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        {KEY_ROWS.map((row, rowIndex) => (
          <Box key={`scrcpy-key-row-${rowIndex}`} sx={ROW_SX}>
            {row.map((char) => (
              <Button
                key={char}
                variant="text"
                aria-label={char}
                sx={KEY_SX}
                onClick={() => typeChar(char)}
              >
                {char}
              </Button>
            ))}
          </Box>
        ))}

        <Box sx={ROW_SX}>
          <Button
            variant="text"
            aria-label={t('scrcpy.space')}
            sx={{ ...KEY_SX, flex: 4, fontSize: '1rem' }}
            onClick={() => typeChar(' ')}
          >
            {t('scrcpy.space')}
          </Button>
          <IconButton
            aria-label={t('scrcpy.backspace')}
            sx={KEY_SX}
            onClick={() => sendKey(BACKSPACE_KEYCODE)}
          >
            <BackspaceOutlinedIcon />
          </IconButton>
          <IconButton
            aria-label={t('scrcpy.enter')}
            sx={KEY_SX}
            onClick={() => sendKey(ENTER_KEYCODE)}
          >
            <KeyboardReturnOutlinedIcon />
          </IconButton>
          <IconButton
            aria-label={t('scrcpy.close')}
            sx={{ ...KEY_SX, color: 'common.white', bgcolor: 'rgba(255, 255, 255, 0.18)' }}
            onClick={onClose}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </Paper>
    </Box>
  )
}

export default ScrcpyKeyboard
