'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, X } from 'lucide-react'
import Image from 'next/image'

export default function EventCheckInCode({ token, dogName }: { token: string; dogName: string }) {
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    if (!open || image) return
    QRCode.toDataURL(`DOGDEX-CHECKIN:${token}`, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#1E3932', light: '#FFFFFF' },
    }).then(setImage).catch(() => setImage(null))
  }, [image, open, token])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-sm flex-1">
        <QrCode className="h-4 w-4" /> Kod odprawy
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Kod QR do odprawy">
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Zamknij" className="absolute right-4 top-4 rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Event Day</p>
            <h2 className="mt-1 font-heading text-xl font-bold">Odprawa: {dogName}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Pokaż ten kod obsłudze wydarzenia. Działa także przy słabym zasięgu.</p>
            <div className="mx-auto mt-5 flex aspect-square w-full max-w-[320px] items-center justify-center rounded-2xl border border-border bg-white p-3">
              {image ? <Image src={image} width={320} height={320} unoptimized alt={`Kod QR odprawy psa ${dogName}`} className="h-full w-full" /> : <span className="text-sm text-muted-foreground">Generowanie kodu…</span>}
            </div>
            <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{token}</p>
          </div>
        </div>
      )}
    </>
  )
}
