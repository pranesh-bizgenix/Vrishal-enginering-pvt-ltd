'use client';

import type { ReactNode } from 'react';

type PaginationBarProps = {
  itemLabel: string;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  busy?: boolean;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
};

function PaginationButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center text-2xl font-semibold leading-none text-slate-300 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-200"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function PaginationBar({
  itemLabel,
  page,
  perPage,
  total,
  totalPages,
  busy = false,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPerPageChange,
}: PaginationBarProps) {
  const startIndex = total ? (page - 1) * perPage + 1 : 0;
  const endIndex = Math.min(page * perPage, total);
  const disablePrevious = busy || page <= 1;
  const disableNext = busy || page >= totalPages;

  return (
    <div className="flex flex-col gap-3 text-[#18315c] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-4 text-lg font-medium sm:text-xl">
        <span>{itemLabel} {startIndex}-{endIndex} of {total}</span>
        <label className="flex items-center gap-3">
          <span>Per page</span>
          <select
            aria-label={`${itemLabel} per page`}
            className="h-10 rounded-[10px] border border-slate-300 bg-white px-3 pr-2 text-xl font-medium text-[#18315c] shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-4 focus:ring-[#8fc740]/15"
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            value={perPage}
          >
            {pageSizeOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex w-fit items-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
        <PaginationButton disabled={disablePrevious} label="First page" onClick={() => onPageChange(1)}>
          &laquo;
        </PaginationButton>
        <PaginationButton disabled={disablePrevious} label="Previous page" onClick={() => onPageChange(Math.max(1, page - 1))}>
          &lsaquo;
        </PaginationButton>
        <PaginationButton disabled={disableNext} label="Next page" onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
          &rsaquo;
        </PaginationButton>
        <PaginationButton disabled={disableNext} label="Last page" onClick={() => onPageChange(totalPages)}>
          &raquo;
        </PaginationButton>
      </div>
    </div>
  );
}
