import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TmaGuard } from './components/TmaGuard'
import { AppLayout } from './components/AppLayout'
import { FeedPage } from './pages/FeedPage'
import { CampaignRejectedPage } from './pages/CampaignRejectedPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useDeeplink } from './hooks/useDeeplink'
import { applyTelegramViewportTheme, expandApp, lockTelegramVerticalSwipes, onTelegramActivated, readyApp, watchViewportHeight } from './utils/telegram'
import { ensureSessionIsolation } from './utils/sessionIsolation'
import { TermsGate } from './components/legal/TermsGate'

const CampaignPage = lazy(() => import('./pages/CampaignPage').then(m => ({ default: m.CampaignPage })))
const CreateCampaignPage = lazy(() => import('./pages/CreateCampaignPage').then(m => ({ default: m.CreateCampaignPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const PublicProfilePage = lazy(() => import('./pages/ProfileSubpages').then(m => ({ default: m.PublicProfilePage })))
const ProfileVerificationPage = lazy(() => import('./pages/ProfileSubpages').then(m => ({ default: m.ProfileVerificationPage })))
const ProfileCampaignsPage = lazy(() => import('./pages/ProfileSubpages').then(m => ({ default: m.ProfileCampaignsPage })))
const ProfileDonationsPage = lazy(() => import('./pages/ProfileSubpages').then(m => ({ default: m.ProfileDonationsPage })))
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSubpages').then(m => ({ default: m.ProfileSettingsPage })))
const WalletPage = lazy(() => import('./pages/WalletPage').then(m => ({ default: m.WalletPage })))
const SupportPage = lazy(() => import('./pages/SupportPage').then(m => ({ default: m.SupportPage })))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })))
const LegalPage = lazy(() => import('./pages/LegalPage').then(m => ({ default: m.LegalPage })))
const KycPage = lazy(() => import('./pages/KycPage').then(m => ({ default: m.KycPage })))
const TonConnectAppProvider = lazy(() => import('./components/TonConnectAppProvider').then(m => ({ default: m.TonConnectAppProvider })))

ensureSessionIsolation()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function AppRoutes() {
  useDeeplink()

  return (
    <Suspense>
      <Routes>
        <Route path="legal/:doc" element={<LegalPage />} />
        <Route path="kyc" element={<KycPage />} />
        <Route path="kyc/level/:targetLevel" element={<KycPage />} />
        <Route path="campaign/:id" element={<CampaignPage />} />
        <Route path="campaign-rejected" element={<CampaignRejectedPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<FeedPage />} />
          <Route path="create" element={<CreateCampaignPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/:userId" element={<PublicProfilePage />} />
          <Route path="profile/verification" element={<ProfileVerificationPage />} />
          <Route path="profile/campaigns" element={<ProfileCampaignsPage />} />
          <Route path="profile/donations" element={<ProfileDonationsPage />} />
          <Route path="profile/settings" element={<ProfileSettingsPage />} />
          <Route path="profile/support" element={<SupportPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  useEffect(() => {
    applyTelegramViewportTheme()
    lockTelegramVerticalSwipes()
    readyApp()
    expandApp()
    watchViewportHeight()
  }, [])

  useEffect(() => onTelegramActivated(() => {
    void queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    void queryClient.invalidateQueries({ queryKey: ['userCampaigns'] })
  }), [])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Suspense>
          <TonConnectAppProvider>
            <TmaGuard>
              <HashRouter>
                <TermsGate>
                  <AppRoutes />
                </TermsGate>
              </HashRouter>
            </TmaGuard>
          </TonConnectAppProvider>
        </Suspense>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
