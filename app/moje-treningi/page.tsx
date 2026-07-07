import { redirect } from 'next/navigation'

interface MyTrainingsPageProps {
  searchParams: Promise<{
    payment?: string
    booking_id?: string
  }>
}

export default async function MyTrainingsPage({ searchParams }: MyTrainingsPageProps) {
  const params = await searchParams
  const nextSearchParams = new URLSearchParams({ tab: 'trainings' })

  if (params.payment) {
    nextSearchParams.set('payment', params.payment)
  }

  if (params.booking_id) {
    nextSearchParams.set('booking_id', params.booking_id)
  }

  redirect(`/moje-zapisy?${nextSearchParams.toString()}`)
}
