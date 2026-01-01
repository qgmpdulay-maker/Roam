import { ArrowLeft, Bell } from 'lucide-react'

type Props = {
  title: string
  showBack?: boolean
  onBack?: () => void
  rightAction?: React.ReactNode
}

export default function Header({ title, showBack, onBack, rightAction }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-neutral-50/80 backdrop-blur border-b border-neutral-200">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-[48px]">
          {showBack ? (
            <button className="icon-btn" aria-label="Back" onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
          ) : (
            <span className="inline-block w-10" />
          )}
        </div>
        <h1 className="text-base font-semibold">{title}</h1>
        <div className="min-w-[48px] flex justify-end">
          {rightAction ?? (
            <button className="icon-btn" aria-label="Notifications">
              <Bell size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
