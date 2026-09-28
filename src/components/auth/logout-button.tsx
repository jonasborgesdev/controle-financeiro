'use client'

import { useNavigate } from '@tanstack/react-router'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function LogoutButton() {
  const navigate = useNavigate()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await navigate({ to: '/login' })
  }

  return (
    <Button variant="outline" onClick={handleLogout}>
      Sair
    </Button>
  )
}
