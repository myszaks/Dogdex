import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabaseServer'
import { getBusinessProfileAccess } from '@/lib/businessAccess'
import CourseAttendanceManager from '@/components/CourseAttendanceManager'
import type { TrainingCourse, TrainingCourseEnrollment, TrainingCourseSession } from '@/types'
import { BUSINESS_COURSE_WORKSPACE_PERMISSIONS } from '@/lib/businessPermissions'

export const dynamic = 'force-dynamic'

export default async function CourseAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()
  const { data: resource } = await db.from('training_courses').select('business_profile_id').eq('id', id).maybeSingle()
  if (!resource?.business_profile_id) notFound()
  const access = await getBusinessProfileAccess(resource.business_profile_id)
  if (!access || !BUSINESS_COURSE_WORKSPACE_PERMISSIONS.some(permission => access.can(permission))) notFound()
  const includeCustomers = access.can('customers.view') || access.can('trainings.attendance')
  const courseQuery = includeCustomers
    ? db.from('training_courses').select('*, training_course_sessions(*), training_course_enrollments(*, dogs(id, name))')
    : db.from('training_courses').select('*, training_course_sessions(*)')
  const { data: rawCourse } = await courseQuery.eq('id', id).eq('business_profile_id', access.profile.id).maybeSingle()
  if (!rawCourse) notFound()
  const course = rawCourse as unknown as TrainingCourse
  const enrollmentIds = (course.training_course_enrollments ?? []).map((item: { id: string }) => item.id)
  const { data: attendance } = access.can('trainings.attendance') && enrollmentIds.length > 0 ? await db.from('training_course_attendance').select('*').in('enrollment_id', enrollmentIds) : { data: [] }
  return <CourseAttendanceManager course={course as TrainingCourse} sessions={(course.training_course_sessions ?? []) as TrainingCourseSession[]} enrollments={(course.training_course_enrollments ?? []) as TrainingCourseEnrollment[]} initialAttendance={attendance ?? []} permissions={{ offer: access.can('trainings.offer'), schedule: access.can('trainings.schedule'), attendance: access.can('trainings.attendance'), customers: access.can('customers.view'), passes: access.can('passes.manage') }} />
}
