'use client'

import { useState } from 'react'
import Image from 'next/image'
import AuthModal from './AuthModal'

interface Props {
  state: 'unauthenticated' | 'forbidden'
  email?: string
}

export default function AuthGateClient({ state, email }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  if (state === 'forbidden') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="text-5xl">🚫</div>
          <h1 className="text-2xl font-bold text-slate-800">Dostęp zablokowany</h1>
          <p className="text-slate-500 text-sm">
            Twoje konto (<span className="font-mono text-slate-700">{email}</span>) nie ma dostępu
            do tego środowiska.
          </p>
          <p className="text-slate-400 text-xs">
            Skontaktuj się z administratorem, aby uzyskać dostęp.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-6">
        <Image
          src="/brand/dogdex-logo.svg"
          alt="Dogdex"
          width={184}
          height={46}
          priority
          className="mx-auto h-[46px] w-[184px]"
        />
        <p className="text-slate-500">
          Zaloguj się, aby uzyskać dostęp do aplikacji.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors"
        >
          Zaloguj się
        </button>
      </div>
      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
