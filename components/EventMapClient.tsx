'use client'
import dynamic from 'next/dynamic'

const EventMap = dynamic(() => import('@/components/EventMap'), {
  ssr: false,
  loading: () => <div className="w-full h-64 bg-slate-100 animate-pulse" />,
})

interface Props {
  lat: number
  lng: number
  label?: string
}

export default function EventMapClient({ lat, lng, label }: Props) {
  return <EventMap lat={lat} lng={lng} label={label} />
}
