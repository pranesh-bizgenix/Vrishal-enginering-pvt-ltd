'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { NavItem, SectionKey } from '../app/dashboard/types';
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import { HomeIcon, Squares2X2Icon } from "@heroicons/react/24/outline";


type PeopleFilterItem = {
  id: string;
  name: string;
  roleLabel: string;
  leaderName?: string | null;
  projectCount: number;
  taskCount: number;
};

type DashboardSidebarProps = {
  activeSection: SectionKey;
  navItems: NavItem[];
  open: boolean;
  onClose: () => void;
  onSelect: (section: SectionKey) => void;
  peopleFilter?: PeopleFilterItem[];
  peopleFilterTitle?: string;
  selectedPersonId?: string;
  onSelectPerson?: (employeeId: string) => void;
};

type DashboardTopbarProps = {
  canRunReport: boolean;
  initials: string;
  subtitle: string;
  title: string;
  userEmail?: string;
  userName?: string;
  onLogout: () => void;
  onMenuOpen: () => void;
  onRunReport: () => void;
  peopleFilter?: PeopleFilterItem[];
  peopleFilterTitle?: string;
  selectedPersonId?: string;
  onSelectPerson?: (employeeId: string) => void;
};

export function DashboardSidebar({
  activeSection,
  navItems,
  open,
  onClose,
  onSelect,
}: DashboardSidebarProps) {
  return (
    <>
      {open ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside
        data-open={open ? 'true' : 'false'}
        className={[
          'dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(292px,88vw)] flex-col overflow-hidden border-r border-slate-200 bg-[#fbfcf9] text-slate-900 shadow-[18px_0_50px_rgba(15,23,42,0.08)] transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-[292px] lg:shrink-0',
          'px-4 py-5 sm:px-6 sm:py-3',
        ].join(' ')}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_14%_8%,rgba(143,199,64,0.2),transparent_30%),radial-gradient(circle_at_86%_2%,rgba(15,23,42,0.08),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-slate-200" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <Image
              alt="Vrishal Engineering Pvt Ltd"
              className="h-14 w-14 rounded-xl border border-white object-cover shadow-[0_16px_36px_rgba(15,23,42,0.14)]"
              height={56}
              src="/vrishal-logo.jpg"
              width={56}
            />
            <div>
              <p className="max-w-[180px] text-[10px] font-bold uppercase leading-4 tracking-[0.2em] text-[#396184]">Vrishal Engineering Pvt Ltd</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">TMS</h1>
            </div>
          </div>
        </div>

        <nav className="relative mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-2 [scrollbar-width:thin]">
          {navItems.map((item) => {
            const active = activeSection === item.key;

            return (
              <button
                key={item.key}
                className={[
                  'group relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition duration-200',
                  active
                    ? 'bg-gradient-to-r from-[#eef8dc] to-white text-[#123b76] shadow-[0_14px_30px_rgba(143,199,64,0.18)] ring-1 ring-[#d8ecbb]'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm',
                ].join(' ')}
                onClick={() => onSelect(item.key)}
                type="button"
              >
                {active ? <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-[#8fc740]" /> : null}
                <span className={['flex h-9 w-9 items-center justify-center rounded-xl transition', active ? 'bg-[#8fc740] text-[#123b76] shadow-[0_8px_18px_rgba(143,199,64,0.22)]' : 'bg-slate-100 text-slate-500 group-hover:bg-[#edf6df] group-hover:text-[#6f9e2c]'].join(' ')}>
                  <SidebarIcon section={item.key} />
                </span>
                <span className="min-w-0 flex-1">{item.label}</span>
                {active ? <span className="h-2 w-2 rounded-full bg-[#8fc740] shadow-[0_0_0_4px_rgba(143,199,64,0.18)]" /> : null}
              </button>
            );
          })}
        </nav>
          <p className="mt-1 rounded-2xl border border-slate-200 bg-white/82 p-2 text-sm leading-6 text-slate-600 shadow-sm">
            Manage employees, projects, tasks, MIS, and notification logs from one place.
          </p>
      </aside>
    </>
  );
}

function SidebarIcon({ section }: { section: SectionKey }) {
  switch (section) {
    case 'overview':
      return (
        <HomeIcon className="h-5 w-5" />
        // <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        //   <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12 12 4.5 20.25 12M5.25 10.5v8.25h13.5V10.5" />
        // </svg>
      );
    case 'projects':
      return (
        <Squares2X2Icon className="h-5 w-5" />
        // <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        //   <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5h16.5M7.5 3.75v7.5M3.75 16.5h16.5M16.5 12.75v7.5" />
        // </svg>
      );
    case 'tasks':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75h10.5M9 12h10.5M9 17.25h10.5M4.5 6.75h.008v.008H4.5V6.75Zm0 5.25h.008v.008H4.5V12Zm0 5.25h.008v.008H4.5v-.008Z" />
        </svg>
      );
    case 'notes':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 4.5h6.879a3 3 0 0 1 2.121.879l2.121 2.121A3 3 0 0 1 19.5 9.621V16.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h7.5M8.25 13.5h7.5M8.25 17.25h4.5" />
        </svg>
      );
    case 'mis':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5h15M6.75 16.5V9.75M12 16.5V4.5M17.25 16.5v-6" />
        </svg>
      );
    case 'activity':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h4.5l2.25-6 3 12 2.25-6h4.5" />
        </svg>
      );
    case 'employees':
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372c1.035 0 2.03-.166 2.958-.472M15 19.128v-.003a6.375 6.375 0 0 0-12.75 0v.003m12.75 0A17.933 17.933 0 0 1 12 19.5c-1.05 0-2.079-.09-3.075-.26m0 0a6.375 6.375 0 0 1 12.15 0M15 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM7.5 10.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
      );
    default:
      return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12M6 12h12" />
        </svg>
      );
  }
}

function AccountIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 0115 0" />
    </svg>
  );
}

export function DashboardTopbar({
  canRunReport,
  initials,
  subtitle,
  title,
  userEmail,
  userName,
  onLogout,
  onMenuOpen,
  onRunReport,
}: DashboardTopbarProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const displayName = userName?.trim() || 'Admin';
  const displayEmail = userEmail?.trim() || displayName.toLowerCase();
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    if (profileOpen) {
      document.addEventListener('mousedown', handlePointerDown);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 text-slate-950 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="flex min-h-[70px] flex-col items-stretch gap-3 px-3 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#8fc740] hover:bg-[#f6fbef] lg:hidden"
            onClick={onMenuOpen}
            type="button"
            aria-label="Open navigation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.24em] text-[#6f9e2c] sm:text-[11px] sm:tracking-[0.32em]">{subtitle}</p>
            <h2 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:gap-3 md:ml-auto md:w-auto">
          {/* {showPeopleFilter ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-none sm:rounded-full">
              <span className="hidden max-w-[180px] truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 xl:inline">
                {effectivePeopleFilterTitle}
              </span>
              <select
                className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#8fc740] focus:bg-white focus:ring-2 focus:ring-[#8fc740]/20 sm:min-w-[190px]"
                onChange={(event) => effectiveOnSelectPerson?.(event.target.value)}
                value={effectiveSelectedPersonId}
              >
                <option value="">All visible data</option>
                {effectivePeopleFilter.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} - {person.roleLabel}
                  </option>
                ))}
              </select>
              {effectiveSelectedPersonId ? (
                <button
                  className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                  onClick={() => effectiveOnSelectPerson?.('')}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null} */}
          {canRunReport ? (
            <button
              className="shrink-0 rounded-full bg-[#8fc740] px-4 py-2.5 text-sm font-bold text-[#010048] shadow-[0_14px_28px_rgba(143,199,64,0.2)] transition hover:-translate-y-0.5 hover:bg-[#9ed052] sm:px-5"
              onClick={onRunReport}
              type="button"
            >
              Run Report
            </button>
          ) : null}

          <div className="relative" ref={profileRef}>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#8fc740] text-sm font-black text-[#010048] shadow-[0_14px_30px_rgba(143,199,64,0.24)] transition hover:scale-[1.03]"
              onClick={() => setProfileOpen((current) => !current)}
              type="button"
            >
              {initials}
            </button>

            {profileOpen ? (
              <div className="absolute right-0 top-14 z-50 w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8fc740] text-xl font-semibold text-[#123b76]">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{displayName}</p>
                    <p className="truncate text-sm text-slate-500">{displayEmail}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-[15px]">
                  <button
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left font-semibold text-slate-700 transition hover:bg-[#f6fbef] hover:text-slate-950"
                    onClick={() => {
                      setProfileOpen(false);
                      router.push('/my-account');
                    }}
                    type="button"
                  >
                    <AccountIcon />
                    <span>My Account</span>
                  </button>
                </div>

                <button
                  className="mt-1 flex w-full rounded-2xl gap-2 px-3 py-2.5 text-left text-[15px] font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700"
                  onClick={onLogout}
                  type="button"
                >
                  <ArrowRightStartOnRectangleIcon className="size-5" />
                  Log Out of Account
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
