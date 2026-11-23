import { Building2, GraduationCap, Users, CalendarDays } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/db'
import { requireProfile } from '@/lib/auth/session'

async function getSummaryCounts() {
  const { tenant_id } = await requireProfile()
  const row = await db.one<{ units: number; teachers: number; class_groups: number; schedules: number }>(
    `SELECT
       (SELECT count(*) FROM school_units WHERE tenant_id = $1)::int AS units,
       (SELECT count(*) FROM teachers WHERE tenant_id = $1)::int AS teachers,
       (SELECT count(*) FROM class_groups WHERE tenant_id = $1)::int AS class_groups,
       (SELECT count(*) FROM generated_schedules WHERE tenant_id = $1 AND deleted_at IS NULL)::int AS schedules`,
    [tenant_id],
  )
  return {
    units: row?.units ?? 0,
    teachers: row?.teachers ?? 0,
    classGroups: row?.class_groups ?? 0,
    schedules: row?.schedules ?? 0,
  }
}

export default async function DashboardPage() {
  const counts = await getSummaryCounts()

  const SUMMARY_CARDS = [
    {
      label: 'Total de Unidades',
      value: counts.units,
      icon: Building2,
      iconColor: 'text-teal',
      bgColor: 'bg-teal/10',
    },
    {
      label: 'Total de Professores',
      value: counts.teachers,
      icon: GraduationCap,
      iconColor: 'text-ocre',
      bgColor: 'bg-ocre/10',
    },
    {
      label: 'Total de Turmas',
      value: counts.classGroups,
      icon: Users,
      iconColor: 'text-navy',
      bgColor: 'bg-navy/10',
    },
    {
      label: 'Total de Horários',
      value: counts.schedules,
      icon: CalendarDays,
      iconColor: 'text-sky',
      bgColor: 'bg-sky/20',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="text-slate text-sm mt-1">
          Visão geral do sistema
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {SUMMARY_CARDS.map(({ label, value, icon: Icon, iconColor, bgColor }) => (
          <Card key={label} className="shadow-sm border border-border">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`${bgColor} rounded-xl p-3 shrink-0`}>
                <Icon className={`${iconColor} w-6 h-6`} />
              </div>
              <div>
                <p className="text-slate text-sm">{label}</p>
                <p className="text-navy text-3xl font-bold leading-tight">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
