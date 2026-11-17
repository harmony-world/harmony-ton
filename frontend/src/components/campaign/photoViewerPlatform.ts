export function isDesktopPhotoViewerPlatform() {
  const platform = window.Telegram?.WebApp?.platform
  if (platform && ['tdesktop', 'macos', 'web', 'weba'].includes(platform)) return true
  if (platform && ['ios', 'android'].includes(platform)) return false
  return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false
}
