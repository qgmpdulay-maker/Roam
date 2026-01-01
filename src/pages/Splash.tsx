import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'

export default function Splash() {
  const { user, initialized } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!initialized) return
    if (user) navigate('/dashboard', { replace: true })
    else navigate('/login', { replace: true })
  }, [initialized, user, navigate])

  return null
}
