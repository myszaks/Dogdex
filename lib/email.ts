import nodemailer from 'nodemailer'
import type { FormField } from '@/types'
import { plForm } from '@/lib/utils'
import { formatEmailDate, formatEmailDateTime } from '@/lib/emailDate'
import {
  cleanEmailSubject,
  emailButton,
  emailDetails,
  emailHtmlToText,
  emailList,
  emailNotice,
  escapeEmailHtml,
  renderEmail,
} from '@/lib/emailTemplate'

const appUrl = () => (
  process.env.NEXT_PUBLIC_APP_URL
  ?? process.env.NEXT_PUBLIC_SITE_URL
  ?? 'https://dogdex.pro'
).replace(/\/$/, '')

function createTransporter() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user, pass },
  })
}

interface DeliverOptions {
  to: string
  subject: string
  html: string
  cc?: string
  replyTo?: string
  throwOnError?: boolean
}

async function deliverEmail(options: DeliverOptions): Promise<boolean> {
  const transporter = createTransporter()
  if (!transporter) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email] SMTP_USER/SMTP_PASS not set — skipping email to', options.to)
    }
    return false
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${process.env.SMTP_USER}>`,
      to: options.to,
      cc: options.cc,
      replyTo: options.replyTo,
      subject: cleanEmailSubject(options.subject),
      html: options.html,
      text: emailHtmlToText(options.html),
    })
    return true
  } catch (error) {
    if (options.throwOnError) throw error
    if (process.env.NODE_ENV === 'development') console.error('[Email] Delivery failed:', error)
    return false
  }
}

function greeting(): string {
  return '<p style="margin:0 0 14px">Cześć!</p>'
}

function paragraph(content: string): string {
  return `<p style="margin:0 0 14px">${content}</p>`
}

function sectionTitle(title: string): string {
  return `<h2 style="margin:22px 0 8px;color:#1E3932;font-size:16px;line-height:1.35">${escapeEmailHtml(title)}</h2>`
}

interface RegistrationEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  status: 'confirmed' | 'pending'
  formFields?: FormField[]
  formData?: Record<string, unknown>
}

function formatFieldValue(field: FormField, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie'
  if (field.type === 'checkbox' && typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return 'Tak'
    if (normalized === 'false') return 'Nie'
  }
  if (Array.isArray(value)) {
    return value.map(item => field.type === 'multidate'
      ? formatEmailDate(String(item), { weekday: false })
      : formatFieldValue(field, item)).join(', ')
  }
  return String(value)
}

function buildFormData(fields?: FormField[], data?: Record<string, unknown>): string {
  if (!fields?.length || !data) return ''
  const rows = fields
    .filter(field => data[field.id] !== undefined && data[field.id] !== null && data[field.id] !== '')
    .map(field => ({ label: field.label, value: formatFieldValue(field, data[field.id]) }))
  return rows.length ? `${sectionTitle('Dodatkowe informacje')}${emailDetails(rows)}` : ''
}

export async function sendRegistrationEmail(payload: RegistrationEmailPayload): Promise<void> {
  const confirmed = payload.status === 'confirmed'
  const title = confirmed ? 'Zapis został potwierdzony' : 'Zapis oczekuje na potwierdzenie'
  const html = renderEmail({
    preheader: `${title}: ${payload.eventTitle}`,
    eyebrow: 'Zapisy na wydarzenie',
    title,
    body: [
      greeting(),
      paragraph(confirmed
        ? `Zgłoszenie psa <strong>${escapeEmailHtml(payload.dogName)}</strong> na wydarzenie zostało potwierdzone.`
        : `Otrzymaliśmy Twoje zgłoszenie na wydarzenie z psem <strong>${escapeEmailHtml(payload.dogName)}</strong>. Teraz oczekuje ono na potwierdzenie przez osobę organizującą wydarzenie.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Data', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: 'Pies', value: payload.dogName },
        { label: 'Status', value: confirmed ? 'Potwierdzony' : 'Oczekuje na potwierdzenie' },
      ]),
      buildFormData(payload.formFields, payload.formData),
      !confirmed ? emailNotice('Nie musisz teraz nic robić. Wyślemy kolejną wiadomość, gdy zapadnie decyzja w sprawie zgłoszenia.', 'warning') : '',
      emailButton('Zobacz moje zapisy', `${appUrl()}/moje-zapisy`),
    ].join(''),
  })

  await deliverEmail({
    to: payload.to,
    subject: `${confirmed ? 'Zapis potwierdzony' : 'Przyjęliśmy zapis'} — ${payload.eventTitle}`,
    html,
  })
}

interface EventChangeEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  changedFields: string[]
  newStartAt: string | null
  newLocation: string | null
}

function changeFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    start_at: 'data i godzina rozpoczęcia',
    end_at: 'data zakończenia',
    location: 'miejsce',
    title: 'nazwa wydarzenia',
  }
  return labels[field] ?? field.replaceAll('_', ' ')
}

export async function sendEventChangeEmail(payload: EventChangeEmailPayload): Promise<void> {
  const significant = payload.changedFields.includes('start_at') || payload.changedFields.includes('location')
  const html = renderEmail({
    preheader: `Zmieniono informacje o wydarzeniu ${payload.eventTitle}`,
    eyebrow: 'Aktualizacja wydarzenia',
    title: 'Ważna zmiana w wydarzeniu',
    body: [
      greeting(),
      paragraph(`Zaktualizowano informacje o wydarzeniu, na które jesteś zapisana/zapisany z psem <strong>${escapeEmailHtml(payload.dogName)}</strong>.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Nowa data', value: payload.newStartAt ? formatEmailDateTime(payload.newStartAt) : null },
        { label: 'Nowe miejsce', value: payload.newLocation },
        { label: 'Pies', value: payload.dogName },
      ]),
      sectionTitle('Co się zmieniło'),
      emailList(payload.changedFields.map(changeFieldLabel)),
      significant ? emailNotice('Sprawdź nową datę lub miejsce i upewnij się, że nadal możesz wziąć udział.', 'warning') : '',
      emailButton('Sprawdź mój zapis', `${appUrl()}/moje-zapisy`),
    ].join(''),
  })
  await deliverEmail({ to: payload.to, subject: `Zmiana w wydarzeniu — ${payload.eventTitle}`, html })
}

interface ScheduleSlot {
  slotDate: string
  slotTime: string
  slotLabel?: string | null
  dogName?: string | null
}

interface ScheduleEmailPayload {
  to: string
  ownerName: string
  dogNames: string[]
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  slots: ScheduleSlot[]
}

function formatSlotDate(date: string): string {
  return formatEmailDate(date, { weekday: true })
}

export async function sendScheduleEmail(payload: ScheduleEmailPayload): Promise<void> {
  const slots = [...payload.slots].sort(
    (a, b) => a.slotDate.localeCompare(b.slotDate) || a.slotTime.localeCompare(b.slotTime),
  )
  if (!slots.length) return

  const multipleDogs = payload.dogNames.length > 1
  const multipleSlots = slots.length > 1
  const slotRows = slots.map(slot => ({
    label: `${formatSlotDate(slot.slotDate)}, ${slot.slotTime.slice(0, 5)}`,
    value: [slot.slotLabel, multipleDogs ? slot.dogName : null].filter(Boolean).join(' · ') || 'Start',
  }))
  const subjectSlot = multipleSlots
    ? plForm(slots.length, 'termin', 'terminy', 'terminów')
    : `${slots[0].slotTime.slice(0, 5)}, ${formatSlotDate(slots[0].slotDate)}`

  const html = renderEmail({
    preheader: `${multipleSlots ? 'Twoje terminy' : 'Twój termin'}: ${subjectSlot}`,
    eyebrow: 'Harmonogram wydarzenia',
    title: multipleSlots ? 'Twoje terminy startów' : 'Twój termin startu',
    body: [
      greeting(),
      paragraph(`Przydzielono Ci ${multipleSlots ? 'terminy startów' : 'termin startu'} podczas wydarzenia <strong>${escapeEmailHtml(payload.eventTitle)}</strong>.`),
      emailDetails(slotRows),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: multipleDogs ? 'Psy' : 'Pies', value: payload.dogNames.join(', ') },
      ]),
      emailNotice('Przyjedź odpowiednio wcześniej, aby mieć czas na przygotowanie i odprawę.', 'neutral'),
      emailButton('Zobacz moje zapisy', `${appUrl()}/moje-zapisy`),
    ].join(''),
  })
  await deliverEmail({
    to: payload.to,
    subject: `${multipleSlots ? 'Twoje terminy startów' : 'Twój termin startu'} — ${payload.eventTitle} — ${subjectSlot}`,
    html,
  })
}

interface CancellationEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  previousStatus: string
}

export async function sendCancellationEmailToOrganizer(payload: CancellationEmailPayload): Promise<void> {
  const html = renderEmail({
    preheader: `Wycofano zapis psa ${payload.dogName}`,
    eyebrow: 'Panel wydarzenia',
    title: 'Rezygnacja z udziału',
    body: [
      paragraph('Otrzymaliśmy rezygnację z udziału w Twoim wydarzeniu.'),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Data', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: 'Opiekun psa', value: payload.ownerName },
        { label: 'Pies', value: payload.dogName },
        { label: 'Poprzedni status', value: payload.previousStatus === 'confirmed' ? 'Potwierdzony' : 'Oczekujący' },
      ]),
      emailNotice('Zapis został już usunięty z listy zgłoszeń. Ta wiadomość nie wymaga żadnej decyzji.', 'neutral'),
      emailButton('Otwórz panel wydarzenia', `${appUrl()}/organizer`),
    ].join(''),
  })
  await deliverEmail({
    to: payload.to,
    subject: `Rezygnacja z udziału — ${payload.dogName} — ${payload.eventTitle}`,
    html,
  })
}

interface CancellationRequestEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  eventLocation?: string | null
  cancelledDates: string[] | null
}

export async function sendCancellationRequestEmailToOrganizer(payload: CancellationRequestEmailPayload): Promise<void> {
  const partial = Boolean(payload.cancelledDates?.length)
  const html = renderEmail({
    preheader: `Nowy wniosek o rezygnację: ${payload.dogName}`,
    eyebrow: 'Wymaga rozpatrzenia',
    title: 'Wniosek o rezygnację',
    body: [
      paragraph('Otrzymaliśmy prośbę o anulowanie zapisu. Zgłoszenie pozostaje aktywne do czasu Twojej decyzji.'),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Data', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: 'Opiekun psa', value: payload.ownerName },
        { label: 'Pies', value: payload.dogName },
        { label: 'Zakres', value: partial ? 'Wybrane terminy' : 'Całe zgłoszenie' },
      ]),
      partial ? `${sectionTitle('Terminy do anulowania')}${emailList(payload.cancelledDates!.map(formatSlotDate))}` : '',
      emailNotice('Zaloguj się do panelu i zaakceptuj lub odrzuć wniosek. Osoba zgłaszająca otrzyma wiadomość z decyzją.', 'warning'),
      emailButton('Rozpatrz wniosek', `${appUrl()}/organizer`),
    ].join(''),
  })
  await deliverEmail({
    to: payload.to,
    subject: `Wniosek o rezygnację — ${payload.dogName} — ${payload.eventTitle}`,
    html,
  })
}

interface CancellationResultEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate?: string | null
  cancelledDates: string[] | null
  accepted: boolean
}

export async function sendCancellationResultEmail(payload: CancellationResultEmailPayload): Promise<void> {
  const partial = Boolean(payload.cancelledDates?.length)
  const title = payload.accepted ? 'Rezygnacja została zaakceptowana' : 'Rezygnacja została odrzucona'
  const html = renderEmail({
    preheader: `${title}: ${payload.eventTitle}`,
    eyebrow: 'Decyzja w sprawie rezygnacji',
    title,
    body: [
      greeting(),
      paragraph(payload.accepted
        ? partial
          ? 'Wskazane terminy zostały anulowane. Pozostała część zgłoszenia jest nadal aktywna.'
          : 'Całe zgłoszenie zostało anulowane.'
        : 'Wniosek nie został zaakceptowany. Twoje zgłoszenie pozostaje aktywne.'),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Data', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Pies', value: payload.dogName },
        { label: 'Decyzja', value: payload.accepted ? 'Zaakceptowano' : 'Odrzucono' },
      ]),
      partial ? `${sectionTitle('Terminy objęte wnioskiem')}${emailList(payload.cancelledDates!.map(formatSlotDate))}` : '',
      emailButton('Sprawdź moje zapisy', `${appUrl()}/moje-zapisy`),
    ].join(''),
  })
  await deliverEmail({
    to: payload.to,
    subject: `${payload.accepted ? 'Rezygnacja zaakceptowana' : 'Rezygnacja odrzucona'} — ${payload.eventTitle}`,
    html,
  })
}

interface ContactEmailPayload {
  name: string
  email: string
  subject: string
  message: string
}

export async function sendContactEmail(payload: ContactEmailPayload): Promise<void> {
  const html = renderEmail({
    preheader: `Wiadomość od ${payload.name}: ${payload.subject}`,
    eyebrow: 'Formularz kontaktowy',
    title: 'Nowa wiadomość',
    body: [
      emailDetails([
        { label: 'Nadawca', value: payload.name },
        { label: 'E-mail', value: payload.email },
        { label: 'Temat', value: payload.subject },
      ]),
      sectionTitle('Treść wiadomości'),
      `<div style="padding:16px;background:#EFF4F2;border:1px solid #E0E5E2;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere">${escapeEmailHtml(payload.message)}</div>`,
      emailNotice(`Odpowiedz na tę wiadomość w programie pocztowym — odpowiedź trafi do ${escapeEmailHtml(payload.email)}.`, 'neutral'),
    ].join(''),
    footerNote: 'Wiadomość przekazana z formularza kontaktowego.',
  })
  await deliverEmail({
    to: process.env.CONTACT_EMAIL ?? 'dogdexpro@gmail.com',
    replyTo: `${payload.name} <${payload.email}>`,
    subject: `[Dogdex] ${payload.subject} — ${payload.name}`,
    html,
    throwOnError: true,
  })
}

export async function sendContactConfirmation(payload: Pick<ContactEmailPayload, 'name' | 'email' | 'subject'>): Promise<void> {
  const html = renderEmail({
    preheader: 'Otrzymaliśmy Twoją wiadomość do Dogdex',
    eyebrow: 'Kontakt z Dogdex',
    title: 'Dziękujemy za wiadomość',
    body: [
      greeting(),
      paragraph('Otrzymaliśmy Twoją wiadomość. Odpowiemy tak szybko, jak to możliwe.'),
      emailDetails([{ label: 'Temat', value: payload.subject }]),
      emailNotice('To automatyczne potwierdzenie — nie odpowiadaj na tę wiadomość.', 'neutral'),
    ].join(''),
  })
  await deliverEmail({ to: payload.email, subject: 'Otrzymaliśmy Twoją wiadomość — Dogdex', html })
}

interface ReminderEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventDate: string | null
  eventLocation: string | null
  reminderDates?: string[] | null
}

export async function sendReminderEmail(payload: ReminderEmailPayload): Promise<void> {
  const dates = payload.reminderDates?.map(date => formatEmailDate(date, { weekday: true, year: false })) ?? []
  const html = renderEmail({
    preheader: `Jutro: ${payload.eventTitle}`,
    eyebrow: 'Przypomnienie o wydarzeniu',
    title: 'Wydarzenie jest jutro',
    body: [
      greeting(),
      paragraph(`Przypominamy o wydarzeniu, na które jesteś zapisana/zapisany z psem <strong>${escapeEmailHtml(payload.dogName)}</strong>.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Data', value: payload.eventDate },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: 'Pies', value: payload.dogName },
      ]),
      dates.length ? `${sectionTitle('Jutrzejsze terminy')}${emailList(dates)}` : '',
      emailNotice('Sprawdź godzinę startu i zaplanuj dojazd z odpowiednim zapasem czasu.', 'warning'),
      emailButton('Zobacz moje zapisy', `${appUrl()}/moje-zapisy`),
    ].join(''),
  })
  await deliverEmail({ to: payload.to, subject: `Przypomnienie: jutro ${payload.eventTitle}`, html })
}

interface TrainingBookingEmailPayload {
  to: string
  userName: string
  trainerName: string
  trainingType: string
  trainingDate: string
  duration: number
  location?: string
  price?: number
  notes?: string
}

export async function sendTrainingBookingConfirmation(payload: TrainingBookingEmailPayload): Promise<void> {
  const html = renderEmail({
    preheader: `Rezerwacja treningu: ${payload.trainingType}, ${payload.trainingDate}`,
    eyebrow: 'Rezerwacja treningu',
    title: 'Trening został zarezerwowany',
    body: [
      greeting(),
      paragraph('Otrzymaliśmy Twoją rezerwację. Jej szczegóły zostały również wysłane do osoby prowadzącej trening.'),
      emailDetails([
        { label: 'Trening', value: payload.trainingType },
        { label: 'Trenerka/trener', value: payload.trainerName },
        { label: 'Termin', value: payload.trainingDate },
        { label: 'Czas trwania', value: `${payload.duration} min` },
        { label: 'Miejsce', value: payload.location },
        { label: 'Cena', value: payload.price !== undefined ? `${payload.price.toLocaleString('pl-PL')} zł` : null },
        { label: 'Twoje uwagi', value: payload.notes },
      ]),
      emailButton('Zobacz moje treningi', `${appUrl()}/moje-treningi`),
    ].join(''),
  })
  await deliverEmail({ to: payload.to, subject: `Rezerwacja treningu — ${payload.trainingType}`, html })
}

interface TrainingNotificationToTrainerPayload {
  to: string
  trainerName: string
  userName: string
  trainingType: string
  trainingDate: string
  duration: number
  userNotes?: string
  bookingId?: string
}

export async function sendTrainingBookingToTrainer(payload: TrainingNotificationToTrainerPayload): Promise<void> {
  const html = renderEmail({
    preheader: `Nowa rezerwacja: ${payload.trainingType}, ${payload.trainingDate}`,
    eyebrow: 'Panel osoby prowadzącej trening',
    title: 'Masz nową rezerwację',
    body: [
      greeting(),
      paragraph('Nowa osoba zapisała się na prowadzony przez Ciebie trening.'),
      emailDetails([
        { label: 'Trening', value: payload.trainingType },
        { label: 'Osoba uczestnicząca', value: payload.userName },
        { label: 'Termin', value: payload.trainingDate },
        { label: 'Czas trwania', value: `${payload.duration} min` },
        { label: 'Uwagi osoby uczestniczącej', value: payload.userNotes },
      ]),
      emailNotice('Otwórz panel trenerki/trenera, aby sprawdzić szczegóły i zarządzać rezerwacją.', 'neutral'),
      emailButton('Przejdź do rezerwacji', `${appUrl()}/trainer/bookings${payload.bookingId ? `/${encodeURIComponent(payload.bookingId)}` : ''}`),
    ].join(''),
  })
  await deliverEmail({ to: payload.to, subject: `Nowa rezerwacja — ${payload.trainingType}`, html })
}

interface TrainingReminderPayload {
  to: string
  userName: string
  trainerName: string
  trainingType: string
  trainingDate: string
  duration: number
}

export async function sendTrainingReminder(payload: TrainingReminderPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `Jutro trening: ${payload.trainingType}, ${payload.trainingDate}`,
    eyebrow: 'Przypomnienie o treningu',
    title: 'Trening jest jutro',
    body: [
      greeting(),
      paragraph('Przypominamy o zaplanowanym treningu.'),
      emailDetails([
        { label: 'Trening', value: payload.trainingType },
        { label: 'Trenerka/trener', value: payload.trainerName },
        { label: 'Termin', value: payload.trainingDate },
        { label: 'Czas trwania', value: `${payload.duration} min` },
      ]),
      emailNotice('Przygotuj potrzebne rzeczy i zaplanuj dojazd z odpowiednim zapasem czasu.', 'warning'),
      emailButton('Zobacz moje treningi', `${appUrl()}/moje-treningi`),
    ].join(''),
  })
  return deliverEmail({ to: payload.to, subject: `Przypomnienie: jutro ${payload.trainingType}`, html })
}

interface EventPaymentRequestEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  amount: number
  currency: string
  checkoutUrl: string
  expiresAt: string
}

export async function sendEventPaymentRequestEmail(payload: EventPaymentRequestEmailPayload): Promise<void> {
  const amount = payload.amount.toLocaleString('pl-PL', { style: 'currency', currency: payload.currency })
  const html = renderEmail({
    preheader: `Opłać zapis na ${payload.eventTitle}: ${amount}`,
    eyebrow: 'Płatność za wydarzenie',
    title: 'Zapis zaakceptowany — czas na płatność',
    body: [
      greeting(),
      paragraph(`Zapis psa <strong>${escapeEmailHtml(payload.dogName)}</strong> został zaakceptowany. Aby potwierdzić udział, opłać zapis przed wygaśnięciem linku.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Pies', value: payload.dogName },
        { label: 'Do zapłaty', value: amount },
        { label: 'Link ważny do', value: formatEmailDateTime(payload.expiresAt) },
      ]),
      emailButton(`Zapłać ${amount}`, payload.checkoutUrl),
      emailNotice('Zapis zostanie potwierdzony automatycznie po otrzymaniu płatności. Jeśli link wygaśnie, skontaktuj się z osobą organizującą wydarzenie.', 'warning'),
    ].join(''),
  })
  await deliverEmail({ to: payload.to, subject: `Płatność za zapis — ${payload.eventTitle}`, html })
}

interface EventRefundResultEmailPayload {
  to: string
  organizerEmail?: string | null
  ownerName: string
  dogName: string
  eventTitle: string
  amount: number
  currency: string
  refundedDates: string[] | null
  succeeded: boolean
  errorMessage?: string | null
}

export async function sendEventRefundResultEmail(payload: EventRefundResultEmailPayload): Promise<void> {
  if (!payload.to) return
  const amount = payload.amount.toLocaleString('pl-PL', { style: 'currency', currency: payload.currency })
  const dates = payload.refundedDates?.map(formatSlotDate) ?? []
  const html = renderEmail({
    preheader: payload.succeeded ? `Zlecono zwrot ${amount}` : `Nie udało się zlecić zwrotu ${amount}`,
    eyebrow: payload.succeeded ? 'Zwrot płatności' : 'Płatność wymaga uwagi',
    title: payload.succeeded ? 'Zwrot został zlecony' : 'Nie udało się zlecić zwrotu',
    body: [
      payload.succeeded ? greeting() : '',
      paragraph(payload.succeeded
        ? 'Zwrot został zlecony na pierwotną metodę płatności.'
        : 'Nie udało się zlecić zwrotu. Zapis pozostał bez zmian.'),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Pies', value: payload.dogName },
        { label: 'Kwota zwrotu', value: amount },
        { label: 'Zakres', value: dates.length ? 'Wybrane terminy' : 'Cały zapis' },
        { label: 'Powód błędu', value: payload.succeeded ? null : payload.errorMessage ?? 'Operator płatności nie podał szczegółów' },
      ]),
      dates.length ? `${sectionTitle('Terminy objęte zwrotem')}${emailList(dates)}` : '',
      emailNotice(payload.succeeded
        ? 'Księgowanie środków może potrwać kilka dni — dokładny czas zależy od banku i operatora karty.'
        : 'Osoba organizująca wydarzenie otrzymała informację o problemie i powinna sprawdzić płatność w panelu.', payload.succeeded ? 'neutral' : 'danger'),
      emailButton('Zobacz moje zapisy', `${appUrl()}/moje-zapisy`),
    ].join(''),
  })
  await deliverEmail({
    to: payload.to,
    cc: !payload.succeeded && payload.organizerEmail ? payload.organizerEmail : undefined,
    subject: `${payload.succeeded ? 'Zlecono zwrot płatności' : 'Zwrot wymaga uwagi'} — ${payload.eventTitle}`,
    html,
  })
}

interface TrainingCancellationPayload {
  to: string
  recipientName: string
  trainingType: string
  trainingDate: string
  cancelledBy: 'user' | 'trainer'
  reason?: string
}

export async function sendTrainingCancellationEmail(payload: TrainingCancellationPayload): Promise<void> {
  const cancelledBy = payload.cancelledBy === 'user'
    ? 'osobę uczestniczącą'
    : 'osobę prowadzącą trening'
  const html = renderEmail({
    preheader: `Anulowano trening ${payload.trainingType}`,
    eyebrow: 'Zmiana rezerwacji',
    title: 'Trening został anulowany',
    body: [
      greeting(),
      paragraph(`Rezerwacja została anulowana przez ${cancelledBy}.`),
      emailDetails([
        { label: 'Trening', value: payload.trainingType },
        { label: 'Termin', value: payload.trainingDate },
        { label: 'Kto anulował', value: payload.cancelledBy === 'user' ? 'Osoba uczestnicząca' : 'Osoba prowadząca trening' },
        { label: 'Powód', value: payload.reason },
      ]),
      emailNotice('Ten termin nie jest już aktywny. W razie pytań skontaktuj się z osobą uczestniczącą lub prowadzącą trening.', 'danger'),
      emailButton(payload.cancelledBy === 'user' ? 'Otwórz panel trenerki/trenera' : 'Zobacz moje treningi', payload.cancelledBy === 'user' ? `${appUrl()}/trainer/bookings` : `${appUrl()}/moje-treningi`),
    ].join(''),
  })
  await deliverEmail({ to: payload.to, subject: `Anulowanie treningu — ${payload.trainingType}`, html })
}

interface RegistrationOpenedEmailPayload {
  to: string
  eventTitle: string
  eventSlug: string
  eventDate: string | null
  eventLocation: string | null
}

export async function sendRegistrationOpenedEmail(payload: RegistrationOpenedEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `Zapisy na „${payload.eventTitle}” są już otwarte`,
    eyebrow: 'Powiadomienie o zapisach',
    title: 'Zapisy właśnie ruszyły',
    body: [
      greeting(),
      paragraph(`Możesz już zapisać się na wydarzenie <strong>${escapeEmailHtml(payload.eventTitle)}</strong>.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Termin', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Miejsce', value: payload.eventLocation },
      ]),
      emailNotice('Liczba miejsc może być ograniczona. Powiadomienie nie rezerwuje miejsca — zapis zostanie potwierdzony dopiero po wysłaniu formularza.', 'warning'),
      emailButton('Przejdź do zapisów', `${appUrl()}/events/${encodeURIComponent(payload.eventSlug)}`),
    ].join(''),
  })

  return deliverEmail({
    to: payload.to,
    subject: `Zapisy ruszyły — ${payload.eventTitle}`,
    html,
    throwOnError: true,
  })
}

interface EventWaitlistJoinedEmailPayload {
  to: string
  dogName: string
  eventTitle: string
  eventSlug: string
  eventDate: string | null
  eventLocation: string | null
  position: number
}

export async function sendEventWaitlistJoinedEmail(payload: EventWaitlistJoinedEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `Lista rezerwowa: ${payload.eventTitle}`,
    eyebrow: 'Lista rezerwowa',
    title: 'Dopisaliśmy Cię do kolejki',
    body: [
      greeting(),
      paragraph(`Pies <strong>${escapeEmailHtml(payload.dogName)}</strong> jest na liście rezerwowej wydarzenia.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Termin', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: 'Pies', value: payload.dogName },
        { label: 'Pozycja w kolejce', value: String(payload.position) },
      ]),
      emailNotice('Gdy zwolni się miejsce, wyślemy osobną wiadomość. Dopiero wtedy będzie można potwierdzić udział.', 'warning'),
      emailButton('Zobacz wydarzenie', `${appUrl()}/events/${encodeURIComponent(payload.eventSlug)}`),
    ].join(''),
  })

  return deliverEmail({
    to: payload.to,
    subject: `Lista rezerwowa — ${payload.eventTitle}`,
    html,
    throwOnError: true,
  })
}

interface EventWaitlistOfferEmailPayload {
  to: string
  dogName: string
  eventTitle: string
  eventDate: string | null
  eventLocation: string | null
  offerUrl: string
  expiresAt: string
}

export async function sendEventWaitlistOfferEmail(payload: EventWaitlistOfferEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `Zwolniło się miejsce na ${payload.eventTitle}`,
    eyebrow: 'Lista rezerwowa',
    title: 'Zwolniło się dla Ciebie miejsce',
    body: [
      greeting(),
      paragraph(`Możesz teraz potwierdzić udział psa <strong>${escapeEmailHtml(payload.dogName)}</strong> w wydarzeniu.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Termin', value: payload.eventDate ? formatEmailDateTime(payload.eventDate) : null },
        { label: 'Miejsce', value: payload.eventLocation },
        { label: 'Oferta ważna do', value: formatEmailDateTime(payload.expiresAt) },
      ]),
      emailNotice('Miejsce jest w tym czasie zarezerwowane tylko dla Ciebie. Jeśli go nie potwierdzisz, propozycję otrzyma kolejna osoba.', 'warning'),
      emailButton('Potwierdź miejsce', payload.offerUrl),
    ].join(''),
  })

  return deliverEmail({
    to: payload.to,
    subject: `Zwolniło się miejsce — ${payload.eventTitle}`,
    html,
    throwOnError: true,
  })
}

interface EventAnnouncementEmailPayload {
  to: string
  eventTitle: string
  eventSlug: string
  announcementTitle: string
  message: string
  dogNames: string[]
}

export async function sendEventAnnouncementEmail(payload: EventAnnouncementEmailPayload): Promise<boolean> {
  const safeMessage = escapeEmailHtml(payload.message).replace(/\r?\n/g, '<br>')
  const html = renderEmail({
    preheader: `${payload.announcementTitle}: ${payload.eventTitle}`,
    eyebrow: 'Komunikat organizatora',
    title: payload.announcementTitle,
    body: [
      greeting(),
      paragraph(`Organizator wydarzenia <strong>${escapeEmailHtml(payload.eventTitle)}</strong> przekazuje ważną informację.`),
      `<div style="margin:18px 0;padding:16px 18px;border-radius:14px;background:#F3F7F5;color:#1E3932;line-height:1.65">${safeMessage}</div>`,
      payload.dogNames.length > 0
        ? emailDetails([{ label: payload.dogNames.length === 1 ? 'Dotyczy psa' : 'Dotyczy psów', value: payload.dogNames.join(', ') }])
        : '',
      emailButton('Zobacz wydarzenie', `${appUrl()}/events/${encodeURIComponent(payload.eventSlug)}`),
    ].join(''),
  })

  return deliverEmail({
    to: payload.to,
    subject: `${payload.announcementTitle} — ${payload.eventTitle}`,
    html,
    throwOnError: true,
  })
}

interface EventTeamInvitationEmailPayload {
  to: string
  eventTitle: string
  eventSlug: string
  permissions: string[]
  inviterName?: string | null
}

export async function sendEventTeamInvitationEmail(payload: EventTeamInvitationEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `Zaproszenie do zespołu wydarzenia ${payload.eventTitle}`,
    eyebrow: 'Zespół wydarzenia',
    title: 'Możesz współzarządzać wydarzeniem',
    body: [
      greeting(),
      paragraph(`${payload.inviterName ? `<strong>${escapeEmailHtml(payload.inviterName)}</strong> zaprasza Cię` : 'Otrzymujesz zaproszenie'} do zespołu wydarzenia <strong>${escapeEmailHtml(payload.eventTitle)}</strong>.`),
      emailDetails([
        { label: 'Wydarzenie', value: payload.eventTitle },
        { label: 'Twój zakres dostępu', value: payload.permissions.join(', ') },
      ]),
      emailNotice('Zaloguj się lub utwórz konto Dogdex przy użyciu adresu e-mail, na który wysłaliśmy tę wiadomość. Dostęp zostanie przypisany automatycznie.', 'neutral'),
      emailButton('Przejdź do wydarzenia', `${appUrl()}/organizer/events/${encodeURIComponent(payload.eventSlug)}`),
    ].join(''),
  })

  return deliverEmail({
    to: payload.to,
    subject: `Zaproszenie do zespołu — ${payload.eventTitle}`,
    html,
  })
}

interface OrganizerTeamInvitationEmailPayload {
  to: string
  organizerName: string
  permissions: string[]
}

export async function sendOrganizerTeamInvitationEmail(payload: OrganizerTeamInvitationEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `Zaproszenie do stałego zespołu organizatora ${payload.organizerName}`,
    eyebrow: 'Zespół organizatora',
    title: 'Dołączasz do stałego zespołu',
    body: [
      greeting(),
      paragraph(`Organizator <strong>${escapeEmailHtml(payload.organizerName)}</strong> zaprasza Cię do swojego zespołu w Dogdex.`),
      emailDetails([
        { label: 'Organizator', value: payload.organizerName },
        { label: 'Domyślny zakres pracy', value: payload.permissions.join(', ') },
      ]),
      emailNotice('Dostęp do konkretnych wydarzeń jest nadawany osobno. Zakres uprawnień może być inny dla każdego wydarzenia.', 'neutral'),
      emailButton('Przejdź do Dogdex', appUrl()),
    ].join(''),
  })

  return deliverEmail({
    to: payload.to,
    subject: `Zaproszenie do zespołu organizatora — ${payload.organizerName}`,
    html,
  })
}

interface EventStartApproachingEmailPayload {
  to: string
  ownerName: string
  dogName: string
  eventTitle: string
  eventSlug: string
  startsBefore: number
}

export async function sendEventStartApproachingEmail(payload: EventStartApproachingEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: `${payload.dogName} zbliża się do startu`,
    eyebrow: 'Event Day',
    title: 'Przygotuj się do startu',
    body: [
      paragraph(`Cześć${payload.ownerName ? ` ${escapeEmailHtml(payload.ownerName)}` : ''}!`),
      paragraph(`<strong>${escapeEmailHtml(payload.dogName)}</strong> ma przed sobą około ${payload.startsBefore} ${payload.startsBefore === 1 ? 'start' : 'starty'} w wydarzeniu <strong>${escapeEmailHtml(payload.eventTitle)}</strong>.`),
      emailNotice('Podejdź do strefy przygotowawczej i śledź bieżącą kolejkę.', 'neutral'),
      emailButton('Otwórz widok wydarzenia', `${appUrl()}/events/${encodeURIComponent(payload.eventSlug)}`),
    ].join(''),
  })
  return deliverEmail({
    to: payload.to,
    subject: `Zbliża się start ${payload.dogName} — ${payload.eventTitle}`,
    html,
  })
}

interface TrainingCommerceStatusEmailPayload {
  to: string
  title: string
  message: string
  actionLabel?: string
  actionUrl?: string
}

export async function sendTrainingCommerceStatusEmail(payload: TrainingCommerceStatusEmailPayload): Promise<boolean> {
  const html = renderEmail({
    preheader: payload.title,
    eyebrow: 'Kursy i karnety',
    title: payload.title,
    body: [
      greeting(),
      paragraph(escapeEmailHtml(payload.message)),
      payload.actionUrl ? emailButton(payload.actionLabel ?? 'Otwórz moje treningi', payload.actionUrl) : '',
    ].join(''),
  })
  return deliverEmail({
    to: payload.to,
    subject: `${payload.title} — Dogdex`,
    html,
  })
}
