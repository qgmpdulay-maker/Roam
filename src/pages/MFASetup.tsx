import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function MFASetup() {
  const [qrSvg, setQrSvg] = useState<string>('')
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle'|'enrolling'|'verifying'|'done'|'error'>('idle')
  const [error, setError] = useState<string>('')
  const navigate = useNavigate()

  async function startEnroll() {
    try {
      setStatus('enrolling'); setError('')
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) throw error

      setFactorId((data as any).id)
      setQrSvg((data as any).totp?.qr_code || (data as any).qr_code || '')
      setStatus('idle')
    } catch (e:any) {
      console.error('enroll error:', e)
      setError(e.message ?? 'Enroll failed')
      setStatus('error')
    }
  }

  async function verify() {
    try {
      setStatus('verifying'); setError('')
      const { data, error } = await (supabase.auth.mfa as any).verify({
        factorId,
        code: code.trim(),
      })
      if (error) throw error
      setStatus('done')
      setTimeout(() => navigate('/dashboard', { replace: true }), 600)
    } catch (e:any) {
      console.error('verify error:', e)
      setError(e.message ?? 'Verification failed')
      setStatus('error')
    }
  }

  useEffect(() => { startEnroll() }, [])

  return (
    <div className="p-6 max-w-[480px] mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Two-Factor Authentication</h1>
      <p className="text-gray-600">
        Scan the QR code using Google Authenticator (or any TOTP app), then enter the 6-digit code.
      </p>

      {qrSvg ? (
        <div className="bg-white rounded-xl shadow p-4 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      ) : (
        <div className="text-gray-500">Preparing QR code…</div>
      )}

      <div className="flex gap-2">
        <input
          inputMode="numeric"
          pattern="\d*"
          maxLength={6}
          value={code}
          onChange={(e)=>setCode(e.target.value)}
          placeholder="6-digit code"
          className="border rounded px-3 py-2 w-full"
        />
        <button
          onClick={verify}
          disabled={!factorId || code.length < 6 || status==='verifying'}
          className="bg-orange-600 text-white px-4 rounded"
        >
          {status==='verifying' ? 'Verifying…' : 'Verify'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {status==='done' && <p className="text-green-600">MFA enabled!</p>}
    </div>
  )
}
