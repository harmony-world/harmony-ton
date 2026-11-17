import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { retrieveLaunchParams, UnknownEnvError, LaunchParamsRetrieveError } from '@tma.js/sdk'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function routeFromStartParam(startParam: string): string | null {
  if (startParam.startsWith('c_')) {
    const campaignId = startParam.slice(2)
    return UUID_RE.test(campaignId) ? `/campaign/${campaignId}` : null
  }

  if (startParam.startsWith('profile_')) {
    const userId = startParam.slice('profile_'.length)
    return UUID_RE.test(userId) ? `/profile/${userId}` : null
  }

  return null
}

export function useDeeplink() {
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const lp = retrieveLaunchParams()
      const startParam = lp.tgWebAppStartParam
      if (!startParam) return

      const route = routeFromStartParam(startParam)
      if (route) navigate(route, { replace: true })
    } catch (e) {
      if (e instanceof UnknownEnvError || e instanceof LaunchParamsRetrieveError) return
      throw e
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
