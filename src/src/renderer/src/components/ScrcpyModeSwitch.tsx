import KeyboardOutlinedIcon from '@mui/icons-material/KeyboardOutlined'
import PhonelinkOutlinedIcon from '@mui/icons-material/PhonelinkOutlined'
import { IconButton, Paper, Tooltip, Typography } from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiviStore } from '../store/store'
import { ScrcpyKeyboard } from './ScrcpyKeyboard'

// Above the projection surface (mirrors SessionSwitchOverlay's z-index).
const SCRCPY_SWITCH_Z_INDEX = 4000

const BUTTON_SX = {
  width: '52px',
  height: '52px',
  color: 'common.white'
}

export function ScrcpyModeSwitch() {
  const settings = useLiviStore((s) => s.settings)
  const saveSettings = useLiviStore((s) => s.saveSettings)
  const { t } = useTranslation()
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const scrcpyMode = Boolean(settings?.scrcpyMode)
  const isRhd = Number(settings?.hand ?? 0) === 1
  // Pin the cluster over the nav rail strip: left for LHD, right for RHD.
  const railOffset = isRhd ? { right: '16px' } : { left: '16px' }

  const setOsk = useCallback((open: boolean) => {
    const scrcpy = window.scrcpy
    if (!scrcpy) return
    void scrcpy.osk(open).catch(() => {})
  }, [])

  const closeKeyboard = useCallback(() => {
    setKeyboardOpen(false)
    setOsk(false)
  }, [setOsk])

  const toggleKeyboard = () => {
    if (keyboardOpen) {
      closeKeyboard()
      return
    }
    setKeyboardOpen(true)
    setOsk(true)
  }

  // Turning the mode off drops the keyboard and hands the phone window back to the compositor.
  const prevModeRef = useRef(scrcpyMode)
  useEffect(() => {
    if (prevModeRef.current === scrcpyMode) return
    prevModeRef.current = scrcpyMode
    if (!scrcpyMode) closeKeyboard()
  }, [scrcpyMode, closeKeyboard])

  // The compositor only keeps the phone window below the UI while we ask it to, so the
  // order must be dropped when this control unmounts.
  useEffect(() => {
    return () => setOsk(false)
  }, [setOsk])

  return (
    <>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          top: '16px',
          ...railOffset,
          zIndex: SCRCPY_SWITCH_Z_INDEX,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          p: '6px',
          borderRadius: '16px',
          bgcolor: 'rgba(18, 18, 20, 0.72)'
        }}
      >
        <Tooltip title={t('scrcpy.mode')}>
          <IconButton
            aria-label={t('scrcpy.mode')}
            aria-pressed={scrcpyMode}
            onClick={() => void saveSettings({ scrcpyMode: !scrcpyMode })}
            sx={{
              ...BUTTON_SX,
              bgcolor: scrcpyMode ? 'primary.main' : 'rgba(255, 255, 255, 0.12)',
              color: scrcpyMode ? 'primary.contrastText' : 'common.white',
              '&:hover': {
                bgcolor: scrcpyMode ? 'primary.dark' : 'rgba(255, 255, 255, 0.22)'
              }
            }}
          >
            <PhonelinkOutlinedIcon />
          </IconButton>
        </Tooltip>

        <Typography sx={{ color: 'common.white', fontSize: '11px', lineHeight: 1, opacity: 0.85 }}>
          {t('scrcpy.title')}
        </Typography>

        {scrcpyMode && (
          <Tooltip title={t('scrcpy.keyboard')}>
            <IconButton
              aria-label={t('scrcpy.keyboard')}
              aria-pressed={keyboardOpen}
              onClick={toggleKeyboard}
              sx={{
                ...BUTTON_SX,
                bgcolor: keyboardOpen ? 'primary.main' : 'rgba(255, 255, 255, 0.12)',
                color: keyboardOpen ? 'primary.contrastText' : 'common.white',
                '&:hover': {
                  bgcolor: keyboardOpen ? 'primary.dark' : 'rgba(255, 255, 255, 0.22)'
                }
              }}
            >
              <KeyboardOutlinedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Paper>

      {scrcpyMode && <ScrcpyKeyboard open={keyboardOpen} onClose={closeKeyboard} />}
    </>
  )
}

export default ScrcpyModeSwitch
