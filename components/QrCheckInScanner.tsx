'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'

type BarcodeDetectorInstance = {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance

export default function QrCheckInScanner({ onCode }: { onCode: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(() => setSupported('BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia)))
  }, [])

  useEffect(() => {
    if (!active || !videoRef.current) return
    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    const detectorConstructor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    if (!detectorConstructor) return
    const detector = new detectorConstructor({ formats: ['qr_code'] })

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async cameraStream => {
        if (cancelled || !videoRef.current) {
          cameraStream.getTracks().forEach(track => track.stop())
          return
        }
        stream = cameraStream
        videoRef.current.srcObject = cameraStream
        await videoRef.current.play()
        const scan = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes[0]?.rawValue) {
              onCode(codes[0].rawValue)
              setActive(false)
              return
            }
          } catch { /* kolejna klatka może być już gotowa */ }
          frame = requestAnimationFrame(scan)
        }
        frame = requestAnimationFrame(scan)
      })
      .catch(() => {
        setError('Nie udało się uruchomić aparatu. Wpisz kod ręcznie.')
        setActive(false)
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [active, onCode])

  if (supported === false) return <p className="text-xs text-muted-foreground">Ta przeglądarka nie obsługuje skanowania aparatem — użyj pola kodu.</p>

  return (
    <div className="space-y-3">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setError(null); setActive(value => !value) }} disabled={supported === null}>
        {active ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {active ? 'Wyłącz aparat' : 'Skanuj QR aparatem'}
      </button>
      {active && <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-2xl bg-black object-cover" />}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
