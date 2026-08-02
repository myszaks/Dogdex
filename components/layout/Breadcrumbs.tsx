import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Okruszki" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const current = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
              {item.href && !current ? (
                <Link href={item.href} className="rounded-md px-1 py-0.5 transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span className={current ? 'px-1 font-medium text-foreground' : 'px-1'} aria-current={current ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
