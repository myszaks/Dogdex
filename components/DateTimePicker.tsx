'use client'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { pl } from 'date-fns/locale'

interface Props {
  value: string | null
  onChange: (iso: string | null) => void
  required?: boolean
  placeholder?: string
  minDate?: Date
  maxDate?: Date
}

export default function DateTimePicker({ value, onChange, required, placeholder, minDate, maxDate }: Props) {
  const selected = value ? new Date(value) : null

  return (
    <DatePicker
      selected={selected}
      onChange={(d: Date | null) => onChange(d ? d.toISOString() : null)}
      showTimeSelect
      timeFormat="HH:mm"
      timeIntervals={15}
      dateFormat="dd.MM.yyyy, HH:mm"
      locale={pl}
      placeholderText={placeholder ?? 'Wybierz datę i godzinę'}
      className="form-input w-full"
      wrapperClassName="w-full"
      required={required}
      isClearable={!required}
      showPopperArrow={false}
      minDate={minDate}
      maxDate={maxDate}
      timeCaption="Godzina"
      autoComplete="off"
    />
  )
}
