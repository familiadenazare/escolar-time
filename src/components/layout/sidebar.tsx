'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  Link2,
  Clock,
  ShieldAlert,
  Settings2,
  Wand2,
  CalendarDays,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  History,
  NotebookPen,
  type LucideIcon,
} from 'lucide-react'

import { ROLE_LABELS, type RoleKey } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

type NavItem = { label: string; href: string; icon: LucideIcon; editorOnly?: boolean }
type NavGroup = { title: string | null; items: NavItem[]; adminOnly?: boolean }

// Menu agrupado como nos outros sistemas do CAFN (Catequese, Preceptoria).
const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [{ label: 'Visão geral', href: '/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Cadastros',
    items: [
      { label: 'Unidades', href: '/dashboard/units', icon: Building2 },
      { label: 'Turmas', href: '/dashboard/classes', icon: Users },
      { label: 'Disciplinas', href: '/dashboard/subjects', icon: BookOpen },
      { label: 'Professores', href: '/dashboard/teachers', icon: GraduationCap },
      { label: 'Atribuições', href: '/dashboard/assignments', icon: Link2 },
    ],
  },
  {
    title: 'Horários',
    items: [
      { label: 'Grades horárias', href: '/dashboard/grids', icon: Clock },
      { label: 'Restrições', href: '/dashboard/constraints', icon: ShieldAlert },
      { label: 'Regras globais', href: '/dashboard/constraints/rules', icon: Settings2 },
      { label: 'Gerar horário', href: '/dashboard/generate', icon: Wand2, editorOnly: true },
      { label: 'Horários gerados', href: '/dashboard/schedules', icon: CalendarDays },
    ],
  },
  {
    title: 'Diários',
    items: [{ label: 'Verificação de diários', href: '/dashboard/diaries', icon: NotebookPen }],
  },
  {
    title: 'Administração',
    adminOnly: true,
    items: [
      { label: 'Usuários', href: '/dashboard/users', icon: UserCog },
      { label: 'Histórico', href: '/dashboard/history', icon: History },
    ],
  },
]

const COLLAPSED_KEY = 'sidebar-collapsed'
const collapsedListeners = new Set<() => void>()

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener)
  return () => {
    collapsedListeners.delete(listener)
  }
}

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

// Celular/tablet estreito: o menu vira gaveta (abre pelo botão da barra de cima).
const DESKTOP_QUERY = '(min-width: 768px)'

function subscribeDesktop(listener: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase() || '?'
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  if (href === '/dashboard/constraints') {
    return (
      pathname === '/dashboard/constraints' ||
      (pathname.startsWith('/dashboard/constraints/') && !pathname.startsWith('/dashboard/constraints/rules'))
    )
  }
  return pathname.startsWith(href)
}

interface SidebarProps {
  userName: string
  userEmail: string
  role: RoleKey
  isAdmin: boolean
  canEdit: boolean
}

export function Sidebar({ userName, userEmail, role, isAdmin, canEdit }: SidebarProps) {
  const pathname = usePathname()
  const collapsedPref = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false)
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => true)
  // Na gaveta do celular o menu aparece sempre inteiro.
  const collapsed = collapsedPref && isDesktop
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(pathname)
  // Fecha a gaveta quando a página muda.
  if (mobileOpen && openedAt !== pathname) {
    setMobileOpen(false)
  }

  function openMobile() {
    setOpenedAt(pathname)
    setMobileOpen(true)
  }

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '0' : '1')
    } catch {}
    collapsedListeners.forEach((l) => l())
  }

  function handleSignOut() {
    window.location.href = '/auth/signout'
  }

  return (
    <>
    {/* Barra de cima no celular */}
    <header className="sticky top-0 z-30 flex items-center gap-2.5 bg-navy-deep px-3 py-2 text-white md:hidden">
      <button
        onClick={openMobile}
        aria-label="Abrir menu"
        aria-expanded={mobileOpen}
        className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-[9px] bg-white/[0.07] hover:bg-white/[0.16]"
      >
        <Menu size={19} />
      </button>
      <Link href="/dashboard" className="flex min-w-0 items-center gap-2 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/crest.png" alt="" width={22} height={28} className="h-7 w-auto flex-none" />
        <b className="font-serif text-[17px] font-semibold">Pedagógico</b>
      </Link>
    </header>

    {mobileOpen && (
      <div className="fixed inset-0 z-40 bg-navy-deep/50 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
    )}

    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col overflow-hidden bg-navy-deep text-white',
        // celular: gaveta por cima da página
        'fixed inset-y-0 left-0 z-50 w-[264px] transition-transform duration-200',
        mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        // computador: coluna fixa, recolhível
        'md:sticky md:top-0 md:z-auto md:translate-x-0 md:shadow-none md:transition-[width]',
        collapsed ? 'md:w-[72px]' : 'md:w-[264px]',
      )}
    >
      {/* Marca + recolher */}
      <div
        className={cn(
          'flex items-center gap-1.5 border-b border-white/[0.08]',
          collapsed ? 'flex-col px-2 py-3' : 'py-3.5 pl-3.5 pr-2.5',
        )}
      >
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/crest.png" alt="" width={33} height={42} className="h-[42px] w-auto flex-none" />
          {!collapsed && (
            <span className="min-w-0">
              <b className="block font-serif text-[19px] font-semibold leading-tight">Pedagógico</b>
              <small className="mt-0.5 block whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.13em] text-ocre-light">
                Família de Nazaré
              </small>
            </span>
          )}
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
          className="grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-[9px] bg-white/[0.07] text-white hover:bg-white/[0.16] md:hidden"
        >
          <X size={17} />
        </button>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="hidden h-8 w-8 flex-none cursor-pointer place-items-center rounded-[9px] bg-white/[0.07] text-white hover:bg-white/[0.16] md:grid"
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      {/* Navegação */}
      <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden pb-3.5 pt-1.5', collapsed ? 'px-2' : 'px-2.5')}>
        {NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin).map((group) => {
          const items = group.items.filter((i) => canEdit || !i.editorOnly)
          if (items.length === 0) return null
          return (
            <div key={group.title ?? 'inicio'}>
              {group.title && !collapsed && (
                <p className="whitespace-nowrap px-2.5 pb-1.5 pt-4 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ocre-light/85">
                  {group.title}
                </p>
              )}
              {group.title && collapsed && <div className="mx-2 my-2 h-px bg-white/[0.08]" />}
              <ul className="space-y-0.5">
                {items.map(({ label, href, icon: Icon }) => {
                  const active = isActive(pathname, href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        title={collapsed ? label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-[11px] rounded-[10px] py-[9px] text-[14.5px] transition-colors',
                          collapsed ? 'justify-center px-2.5' : 'px-2.5',
                          active
                            ? 'bg-ocre/[0.16] font-semibold text-white before:absolute before:-left-2.5 before:bottom-2 before:top-2 before:w-1 before:rounded-r before:bg-ocre'
                            : 'font-medium text-white/[0.78] hover:bg-white/[0.07] hover:text-white',
                        )}
                      >
                        <Icon size={20} strokeWidth={1.7} className={cn('flex-none', active && 'text-ocre-light')} />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Usuário */}
      <div className="border-t border-white/[0.08] p-2.5">
        <div className={cn('flex items-center gap-2.5 px-2 pb-2 pt-1', collapsed && 'justify-center')} title={userEmail}>
          <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-ocre text-sm font-bold text-navy-deep">
            {initials(userName)}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <b className="block truncate text-sm">{userName}</b>
              <small className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ocre-light">
                {canEdit ? ROLE_LABELS[role] : 'Somente consulta'}
              </small>
            </span>
          )}
        </div>
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sair' : undefined}
          className={cn(
            'flex w-full cursor-pointer items-center gap-[11px] rounded-[10px] px-2.5 py-[7px] text-[13.5px] text-white/[0.78] hover:bg-white/[0.07] hover:text-white',
            collapsed && 'justify-center',
          )}
        >
          <LogOut size={18} strokeWidth={1.7} />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
    </>
  )
}
