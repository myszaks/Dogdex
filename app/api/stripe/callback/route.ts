import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // Contains user ID

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/trainer/profile?error=Brak_autoryzacji`
    )
  }

  try {
    // Exchange code for stripe account ID
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })

    const stripeAccountId = response.stripe_user_id

    // Save to profile
    const supabase = await createAuthClient()
    const { data, error } = await supabase
      .from('profiles')
      .update({
        stripe_account_id: stripeAccountId,
        stripe_onboarded: true,
      })
      .eq('id', state)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      throw new Error('Błąd przy zapisywaniu')
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/trainer/profile?stripe_connected=true`
    )
  } catch (error) {
    console.error('Stripe error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/trainer/profile?error=Stripe_error`
    )
  }
}
