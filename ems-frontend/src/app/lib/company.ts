'use client';

export function getActiveCompanyKey() {
  if (typeof window === 'undefined') {
    return 'company_1';
  }

  return localStorage.getItem('companyKey') || 'company_1';
}
