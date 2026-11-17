import type { KycStatusResponse } from '../api/kyc'
import type { KycVerificationLevel } from '../constants/kycLevels'

export type UserAction = 'idle' | 'verifying'
export type Screen = 'loading' | 'pre' | 'verifying' | 'verified' | 'pending' | 'rejected'

interface LocationState {
  returnTo?: string
}

export function getReturnTo(state: unknown): string {
  const returnTo = (state as LocationState | null)?.returnTo
  return returnTo && returnTo.startsWith('/') ? returnTo : '/create'
}

export function deriveScreen(
  status: KycStatusResponse | undefined,
  isLoading: boolean,
  userAction: UserAction,
  accessToken: string | null,
  targetLevel: KycVerificationLevel,
): Screen {
  if (isLoading || !status) return 'loading'
  if (userAction === 'verifying' && accessToken) return 'verifying'
  if (status.kycLevel >= targetLevel) return 'verified'
  if (status.status === 'pending') return 'pending'
  if (status.status === 'rejected' || status.status === 'rejected_duplicate') return 'rejected'
  return 'pre'
}

export function getRequirementRows(targetLevel: KycVerificationLevel): string[] {
  if (targetLevel === 3) {
    return ['3.0', '3.1']
  }
  if (targetLevel === 4) {
    return ['4.0', '4.1', '4.2']
  }
  if (targetLevel === 5) {
    return ['5.0', '5.1', '5.2']
  }
  return ['2.0', '2.1']
}
