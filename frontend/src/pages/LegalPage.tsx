import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isLegalDocKind } from '../legal'
import { LegalDocumentScreen } from '../components/legal/TermsGate'

export function LegalPage() {
  const { doc } = useParams()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  if (!isLegalDocKind(doc)) return <Navigate to="/" replace />
  return <LegalDocumentScreen kind={doc} language={i18n.language} onBack={() => navigate(-1)} />
}
