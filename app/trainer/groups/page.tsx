import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabaseServer'
import { getBusinessProfileAccess } from '@/lib/businessAccess'
import { redirect } from 'next/navigation'
import { BUSINESS_COURSE_WORKSPACE_PERMISSIONS, BUSINESS_TRAINING_WORKSPACE_PERMISSIONS } from '@/lib/businessPermissions'
import TrainingGroupsManager from '@/components/TrainingGroupsManager'
import TrainingPassRequestsManager from '@/components/TrainingPassRequestsManager'
import type { TrainingCourse, TrainingPass, TrainingPassProduct, TrainingType } from '@/types'

export const metadata: Metadata = { title: 'Grupy, kursy i karnety' }
export const dynamic = 'force-dynamic'

export default async function TrainerGroupsPage() {
  const access = await getBusinessProfileAccess()
  if (!access) redirect('/profile/role-request')
  if (!BUSINESS_TRAINING_WORKSPACE_PERMISSIONS.some(permission => access.can(permission))) redirect('/manage')
  const db = createServerClient()
  const canSeeCustomers = access.can('customers.view') || access.can('trainings.attendance')
  const canManageCourses = BUSINESS_COURSE_WORKSPACE_PERMISSIONS.some(permission => access.can(permission))
  const canManagePasses = access.can('passes.manage')
  const coursesQuery = canSeeCustomers
    ? db.from('training_courses').select('*, training_course_sessions(*), training_course_enrollments(*, dogs(id, name))')
    : db.from('training_courses').select('*, training_course_sessions(*)')
  const [{ data: courses }, { data: types }, { data: products }] = await Promise.all([
    canManageCourses ? coursesQuery.eq('business_profile_id', access.profile.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    db.from('training_types').select('*').eq('business_profile_id', access.profile.id).eq('is_active', true),
    canManagePasses ? db.from('training_pass_products').select('*').eq('business_profile_id', access.profile.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const productIds = (products ?? []).map(product => product.id)
  const { data: passes } = productIds.length > 0
    ? await db.from('training_passes').select('*, dogs(id, name), training_pass_products(*), training_pass_adjustments(*), training_pass_usages(*)').in('product_id', productIds).order('created_at', { ascending: false })
    : { data: [] }
  const ownerIds = [...new Set((passes ?? []).map(pass => pass.user_id))]
  const { data: ownerDogRows } = ownerIds.length > 0
    ? await db.from('dogs').select('id, name, user_id').in('user_id', ownerIds).order('name')
    : { data: [] }
  const ownerDogs = (ownerDogRows ?? []).reduce<Record<string, Array<{ id: string; name: string }>>>((result, dog) => {
    result[dog.user_id] = [...(result[dog.user_id] ?? []), { id: dog.id, name: dog.name }]
    return result
  }, {})
  const { data: passRequests } = canManagePasses ? await db.from('training_pass_requests').select(`
    *, training_passes!inner(dogs(name), training_pass_products!inner(name, trainer_id))
  `).eq('training_passes.training_pass_products.business_profile_id', access.profile.id).eq('status', 'pending').order('created_at', { ascending: true }) : { data: [] }
  return <div className="space-y-7">{canManagePasses && <TrainingPassRequestsManager initialRequests={(passRequests ?? []) as never[]} />}<TrainingGroupsManager initialCourses={(courses ?? []) as unknown as TrainingCourse[]} trainingTypes={(types ?? []) as TrainingType[]} initialProducts={(products ?? []) as TrainingPassProduct[]} initialPasses={(passes ?? []) as TrainingPass[]} ownerDogs={ownerDogs} permissions={{ offer: access.can('trainings.offer'), schedule: access.can('trainings.schedule'), attendance: access.can('trainings.attendance'), customers: access.can('customers.view'), passes: canManagePasses, payments: access.can('payments.view'), refunds: access.can('refunds.manage') }} /></div>
}
