'use client'

import { useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { cn } from 'cn'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

type LogoutButtonProps = {
  className?: string
  label?: string
  showIcon?: boolean
}

export default function LogoutButton({ className, label = 'Sair', showIcon = false }: LogoutButtonProps) {
  const navigate = useNavigate()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await navigate({ to: '/login' })
  }

  return (
    <Button
      variant="outline"
      className={cn(className)}
      onClick={handleLogout}
    >
      {showIcon ? <LogOut className="size-4" aria-hidden="true" /> : null}
      <span>{label}</span>
    </Button>
  )
}
