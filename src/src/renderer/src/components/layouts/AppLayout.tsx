import WifiIcon from '@mui/icons-material/Wifi'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useLiviStore, useStatusStore } from '@store/store'
import { FC, PropsWithChildren, useCallback } from 'react'
import { useLocation } from 'react-router'
import { ROUTES, UI } from '../../constants'
import { useAutoHideNav } from '../../hooks/useAutoHideNav'
import { useBlinkingTime } from '../../hooks/useBlinkingTime'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useReportVideoInsets } from '../../hooks/useReportVideoInsets'
import { getWindowRole } from '../../utils/windowRole'
import { Nav } from '../navigation'
import { useTabsConfig } from '../navigation/useTabsConfig'
import { AppLayoutProps } from './types'

export const AppLayout: FC<PropsWithChildren<AppLayoutProps>> = ({
  children,
  navRef,
  mainRef,
  receivingVideo
}) => {
  const { pathname } = useLocation()
  const settings = useLiviStore((s) => s.settings)
  const isStreaming = useStatusStore((s) => s.isStreaming)
  const time = useBlinkingTime()
  const network = useNetworkStatus()
  const theme = useTheme()

  // Time + Wi-Fi widget only on the Main window
  const isVisibleTimeAndWifi =
    getWindowRole() === 'main' && window.innerHeight > UI.MIN_HEIGHT_SHOW_TIME_WIFI
  const isXSIcons = typeof window !== 'undefined' && window.innerHeight <= UI.XS_ICON_MAX_HEIGHT
  const clockFontSize = isXSIcons ? '1rem' : '1.5rem'

  const inAutoHideNavPage = pathname === ROUTES.CLUSTER || pathname === ROUTES.TELEMETRY

  // The rail keeps its own layout column and everything else — including the compositor's
  // video plane, which is scaled to the reported strip — sits beside it, so nothing runs
  // underneath the rail. Auto-hide is opt-in (`navAutoHide`, off by default): when it is
  // on, the rail slides away after a few seconds of inactivity wherever it would otherwise
  // sit over content, and floats out of the layout while it is gone, which hands the
  // content the full width.
  const streamingRail =
    isStreaming && pathname === ROUTES.HOME && Boolean(settings?.navWhileStreaming)
  const autoHideNav = Boolean(settings?.navAutoHide) && (inAutoHideNavPage || streamingRail)
  // A rail that is not shown while streaming at all (navWhileStreaming off) also floats,
  // which is upstream's full-bleed projection.
  const hideNavHome = isStreaming && pathname === ROUTES.HOME && !settings?.navWhileStreaming
  const navOverlay = autoHideNav || hideNavHome

  const { hidden: autoHiddenNav } = useAutoHideNav(autoHideNav, navRef.current)

  const tabs = useTabsConfig(receivingVideo)
  const singleTab = tabs.length <= 1

  const hideNav = hideNavHome || (autoHideNav && autoHiddenNav)

  useReportVideoInsets(mainRef, Boolean(settings?.scrcpyMode))

  // Steering wheel position
  const isRhd = Number(settings?.hand ?? 0) === 1
  const layoutDirection: 'row' | 'row-reverse' = isRhd ? 'row-reverse' : 'row'

  const onUserActivity = useCallback(() => {
    window.app?.notifyUserActivity?.()
  }, [])

  return (
    <div
      id="main"
      className="App"
      onPointerDownCapture={onUserActivity}
      style={{
        height: '100dvh',
        touchAction: 'none',
        display: 'flex',
        flexDirection: layoutDirection
      }}
    >
      {/* NAV COLUMN */}
      {!singleTab && (
        <div
          ref={navRef}
          id="nav-root"
          style={{
            height: '100%',
            width: isXSIcons ? 56 : undefined,
            display: 'flex',
            flexDirection: 'column',
            borderRight: isRhd ? undefined : '1px solid #444',
            borderLeft: isRhd ? '1px solid #444' : undefined,
            flex: '0 0 auto',
            position: navOverlay ? 'absolute' : 'relative',
            top: navOverlay ? 0 : undefined,
            left: navOverlay && !isRhd ? 0 : undefined,
            right: navOverlay && isRhd ? 0 : undefined,
            zIndex: UI.NAV_Z_INDEX,
            opacity: hideNav ? 0 : 1,
            transform: hideNav
              ? isRhd
                ? 'translateX(10px)'
                : 'translateX(-10px)'
              : 'translateX(0)',
            transition: 'opacity 220ms ease, transform 220ms ease',
            pointerEvents: hideNav ? 'none' : 'auto'
          }}
        >
          {isVisibleTimeAndWifi && (
            <div
              style={{
                paddingTop: '1rem',
                background: theme.palette.background.paper
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
                <Typography style={{ fontSize: clockFontSize }}>{time}</Typography>

                <div>
                  {network.type === 'wifi' ? (
                    <WifiIcon fontSize="small" style={{ fontSize: '1rem' }} />
                  ) : !network.online ? (
                    <WifiOffIcon fontSize="small" style={{ fontSize: '1rem', opacity: 0.7 }} />
                  ) : null}
                </div>
              </Box>
            </div>
          )}

          {/* Nav should fill remaining height */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <Nav receivingVideo={receivingVideo} settings={settings} />
          </div>
        </div>
      )}

      {/* CONTENT COLUMN */}
      <div
        ref={mainRef}
        id="content-root"
        data-nav-hidden={hideNav || singleTab ? '1' : '0'}
        data-nav-present={singleTab ? '0' : '1'}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {children}
      </div>
    </div>
  )
}
