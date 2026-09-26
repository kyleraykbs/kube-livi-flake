import { Box } from '@mui/material'
import { useHostSize } from '@renderer/hooks/useHostSize'
import type { PropsWithChildren } from 'react'
import * as React from 'react'

type DashShellProps = PropsWithChildren<{
  className?: string
  designWidth?: number
  designHeight?: number
}>

export function DashShell({
  children,
  className,
  designWidth = 1280,
  designHeight = 720
}: DashShellProps) {
  // The host area is the content column, not the window: the rail keeps its own width.
  const { w, h } = useHostSize()
  const scale = w > 0 && h > 0 ? Math.min(w / designWidth, h / designHeight) : 1

  return (
    <Box
      className={className}
      sx={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        '--dash-scale': String(scale)
      }}
    >
      {children}
    </Box>
  )
}
