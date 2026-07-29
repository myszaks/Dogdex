'use client'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './date-time-picker.css'
import { pl } from 'date-fns/locale'
import { format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'

interface Props {
  value: string | null
  onChange: (iso: string | null) => void
  required?: boolean
  placeholder?: string
  minDate?: Date
}

export default function DateTimePicker({ value, onChange, required, placeholder, minDate }: Props) {
  const selected = value ? new Date(value) : null

  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-sage-500" />
      <DatePicker
        selected={selected}
        onChange={(date: Date | null) => onChange(date ? date.toISOString() : null)}
        showTimeInput
        timeInputLabel="Godzina"
        timeFormat="HH:mm"
        dateFormat="dd.MM.yyyy, HH:mm"
        locale={pl}
        placeholderText={placeholder ?? 'Wybierz datę i godzinę'}
        className={`form-input min-h-12 w-full pl-10 ${selected && !required ? 'pr-10' : 'pr-3'}`}
        wrapperClassName="w-full"
        calendarClassName="dogdex-date-picker"
        popperClassName="dogdex-date-picker-popper"
        required={required}
        showPopperArrow={false}
        minDate={minDate}
        calendarStartDay={1}
        strictParsing
        autoComplete="off"
        todayButton="Przejdź do dzisiaj"
        renderCustomHeader={({
          date,
          decreaseMonth,
          increaseMonth,
          prevMonthButtonDisabled,
          nextMonthButtonDisabled,
        }) => (
          <div className="dogdex-date-picker__header">
            <button
              type="button"
              onClick={decreaseMonth}
              disabled={prevMonthButtonDisabled}
              aria-label="Poprzedni miesiąc"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>{format(date, 'LLLL yyyy', { locale: pl })}</span>
            <button
              type="button"
              onClick={increaseMonth}
              disabled={nextMonthButtonDisabled}
              aria-label="Następny miesiąc"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      />
      <Clock3 className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-sage-400 ${selected && !required ? 'right-10' : 'right-3.5'}`} />
      {selected && !required && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-sage-500 hover:bg-sage-100 hover:text-primary"
          aria-label="Wyczyść datę"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
