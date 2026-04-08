import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'

export default function Splash() {
  const { user, initialized } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!initialized) return

    const timer = setTimeout(() => {
      if (user) navigate('/dashboard', { replace: true })
      else navigate('/login', { replace: true })
    }, 2000)

    return () => clearTimeout(timer)
  }, [initialized, user, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
      <img
        src="/logo.png"
        alt="ROAM Logo"
        className="w-32 h-32 object-contain"
      />
    </div>
  )
}